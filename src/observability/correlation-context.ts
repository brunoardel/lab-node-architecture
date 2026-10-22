import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

/**
 * Interface que define as propriedades armazenadas no contexto assíncrono
 * de cada requisição ou operação em segundo plano via AsyncLocalStorage.
 */
export interface CorrelationContext {
  /**
   * Identificador único que correlaciona a requisição por todas as camadas
   * (Controllers, Services, Repositories e logs distribuídos).
   */
  readonly correlationId: string;

  /**
   * Alias para correlationId, atendendo a nomenclatura de requestId.
   */
  readonly requestId: string;

  /**
   * Timestamp em milissegundos da entrada da requisição no sistema.
   */
  readonly startTime: number;

  /**
   * Identificador de correlação herdado de chamadas externas (opcional).
   */
  readonly parentCorrelationId?: string;

  /**
   * Método HTTP da requisição (se aplicável).
   */
  readonly method?: string;

  /**
   * Rota ou URL acessada (se aplicável).
   */
  readonly path?: string;

  /**
   * Propriedades arbitrárias adicionais inseridas durante o ciclo de vida.
   */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Instância única de AsyncLocalStorage do Node.js responsável por manter
 * o contexto de execução assíncrona propagado pelo Event Loop sem poluir
 * assinaturas de funções com parâmetros 'req' ou 'correlationId'.
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Cria uma estrutura padronizada de CorrelationContext.
 */
export function createCorrelationContext(options: {
  correlationId?: string;
  parentCorrelationId?: string;
  method?: string;
  path?: string;
  metadata?: Record<string, unknown>;
} = {}): CorrelationContext {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  return {
    correlationId,
    requestId: correlationId,
    startTime: Date.now(),
    parentCorrelationId: options.parentCorrelationId,
    method: options.method,
    path: options.path,
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/**
 * Obtém o CorrelationContext ativo da thread assíncrona atual.
 * Retorna undefined se a execução estiver fora de qualquer escopo de requisição.
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Obtém apenas o correlationId atual ou um fallback caso esteja fora de contexto.
 */
export function getCorrelationId(fallback?: string): string | undefined {
  return correlationStorage.getStore()?.correlationId ?? fallback;
}

/**
 * Executa uma função síncrona ou assíncrona dentro de um escopo delimitado
 * pelo CorrelationContext informado.
 */
export function runWithCorrelationContext<T>(
  context: CorrelationContext,
  fn: () => T
): T {
  return correlationStorage.run(context, fn);
}

/**
 * Adiciona ou sobrescreve uma propriedade arbitrária no metadata do contexto atual.
 */
export function setContextMetadata(key: string, value: unknown): void {
  const store = correlationStorage.getStore();
  if (store) {
    const mutableStore = store as { metadata?: Record<string, unknown> };
    if (!mutableStore.metadata) {
      mutableStore.metadata = {};
    }
    mutableStore.metadata[key] = value;
  }
}
