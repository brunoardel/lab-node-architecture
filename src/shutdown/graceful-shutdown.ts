import { FastifyInstance } from 'fastify';
import { appLogger } from '../observability/logger.js';

export type ShutdownHook = () => Promise<void> | void;

export interface RegisteredHook {
  readonly name: string;
  readonly priority: number; // Menor prioridade executa antes
  readonly hook: ShutdownHook;
}

export interface GracefulShutdownOptions {
  timeoutMs?: number;
  signals?: readonly NodeJS.Signals[];
  exitProcessOnFinish?: boolean;
  onBeforeExit?: (code: number) => void;
}

export class GracefulShutdownManager {
  private readonly hooks: RegisteredHook[] = [];
  private isShuttingDown = false;
  private readonly timeoutMs: number;
  private readonly signals: readonly NodeJS.Signals[];
  private readonly exitProcessOnFinish: boolean;
  private readonly onBeforeExit?: (code: number) => void;
  private activeSignalListeners: Array<{ signal: NodeJS.Signals; listener: () => void }> = [];

  constructor(options: GracefulShutdownOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.signals = options.signals ?? ['SIGINT', 'SIGTERM'];
    this.exitProcessOnFinish = options.exitProcessOnFinish ?? true;
    this.onBeforeExit = options.onBeforeExit;
  }

  /**
   * Registra um recurso para encerramento ordenado.
   * Prioridade: menores números executam primeiro (ex: 10 fecha servidor HTTP, 20 finaliza Workers, 30 flush de logs).
   */
  public registerResource(name: string, hook: ShutdownHook, priority = 50): void {
    this.hooks.push({ name, priority, hook });
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Registra a instância do Fastify para interrupção de recebimento
   * de novas conexões e finalização das requisições em voo.
   */
  public registerFastifyApp(app: FastifyInstance, priority = 10): void {
    this.registerResource(
      'Fastify HTTP Server (encerra conexões e drena requisições em voo)',
      async () => {
        if (typeof (app.server as any)?.closeIdleConnections === 'function') {
          (app.server as any).closeIdleConnections();
        }
        await app.close();
      },
      priority
    );
  }

  /**
   * Inicia o processo de encerramento suave ordenado.
   */
  public async shutdown(signal = 'MANUAL'): Promise<void> {
    if (this.isShuttingDown) {
      appLogger.warn(`Sinal de encerramento recebido novamente (${signal}). Encerramento já em curso.`);
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    appLogger.info(
      `Iniciando Graceful Shutdown (Sinal: ${signal}). Limite de tolerância: ${this.timeoutMs}ms...`
    );

    // Timeout de segurança: caso algum recurso trave, força a saída com código de erro 1
    const timeoutHandle = setTimeout(() => {
      appLogger.error(
        `Tempo limite do Graceful Shutdown de ${this.timeoutMs}ms foi atingido! Forçando encerramento imediato.`
      );
      if (this.onBeforeExit) {
        this.onBeforeExit(1);
      }
      if (this.exitProcessOnFinish) {
        process.exit(1);
      }
    }, this.timeoutMs);

    // Permite que o processo saia caso o timer seja o único item restante no Event Loop
    timeoutHandle.unref();

    let exitCode = 0;

    try {
      for (const item of this.hooks) {
        appLogger.info(`[Graceful Shutdown] Fechando recurso: ${item.name} (prioridade ${item.priority})...`);
        const itemStart = Date.now();
        try {
          await Promise.resolve(item.hook());
          const itemDuration = Date.now() - itemStart;
          appLogger.info(`[Graceful Shutdown] Recurso finalizado com sucesso: ${item.name} em ${itemDuration}ms`);
        } catch (err) {
          appLogger.error(
            `[Graceful Shutdown] Erro ao fechar recurso '${item.name}':`,
            err instanceof Error ? err : new Error(String(err))
          );
          exitCode = 1;
        }
      }

      const totalDuration = Date.now() - startTime;
      appLogger.info(
        `Graceful Shutdown concluído com sucesso em ${totalDuration}ms. Todos os recursos foram liberados.`
      );
    } finally {
      clearTimeout(timeoutHandle);
      this.teardownListeners();

      if (this.onBeforeExit) {
        this.onBeforeExit(exitCode);
      }

      if (this.exitProcessOnFinish) {
        process.exit(exitCode);
      }
    }
  }

  /**
   * Conecta os listeners de sinais do sistema operacional (SIGINT e SIGTERM).
   */
  public listen(): void {
    for (const signal of this.signals) {
      const listener = () => {
        void this.shutdown(signal);
      };
      this.activeSignalListeners.push({ signal, listener });
      process.on(signal, listener);
    }
  }

  /**
   * Remove os listeners de sinais (útil para testes unitários ou cleanup).
   */
  public teardownListeners(): void {
    for (const { signal, listener } of this.activeSignalListeners) {
      process.removeListener(signal, listener);
    }
    this.activeSignalListeners = [];
  }

  public getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  public getRegisteredResources(): readonly string[] {
    return this.hooks.map((h) => h.name);
  }
}

/**
 * Função utilitária para inicializar e configurar o Graceful Shutdown da aplicação.
 */
export function setupGracefulShutdown(
  app: FastifyInstance,
  options: GracefulShutdownOptions & {
    workerPool?: {
      destroy?: () => Promise<void> | void;
      terminate?: () => Promise<void> | void;
    };
  } = {}
): GracefulShutdownManager {
  const manager = new GracefulShutdownManager(options);

  // 1. Interrompe conexões HTTP e finaliza requisições em voo (Prioridade 10)
  manager.registerFastifyApp(app, 10);

  // 2. Finaliza Worker Threads se configurado (Prioridade 20)
  if (options.workerPool) {
    manager.registerResource(
      'Worker Pool (encerra Worker Threads ativas)',
      async () => {
        if (options.workerPool) {
          if (typeof options.workerPool.terminate === 'function') {
            await options.workerPool.terminate();
          } else if (typeof options.workerPool.destroy === 'function') {
            await options.workerPool.destroy();
          }
        }
      },
      20
    );
  }

  manager.listen();
  return manager;
}
