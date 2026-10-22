import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import {
  GracefulShutdownManager,
  setupGracefulShutdown,
} from '../src/shutdown/graceful-shutdown.js';

describe('GracefulShutdownManager (RF05)', () => {
  it('deve executar recursos registrados estritamente na ordem crescente de prioridade', async () => {
    const executedOrder: string[] = [];

    const manager = new GracefulShutdownManager({
      exitProcessOnFinish: false,
    });

    manager.registerResource(
      'Recurso Prioridade 50 (Flush de Logs)',
      () => {
        executedOrder.push('flush-logs');
      },
      50
    );

    manager.registerResource(
      'Recurso Prioridade 10 (Fechar Servidor HTTP)',
      () => {
        executedOrder.push('http-server');
      },
      10
    );

    manager.registerResource(
      'Recurso Prioridade 20 (Finalizar Worker Pool)',
      () => {
        executedOrder.push('worker-pool');
      },
      20
    );

    await manager.shutdown('SIGTERM');

    expect(executedOrder).toEqual(['http-server', 'worker-pool', 'flush-logs']);
    expect(manager.getIsShuttingDown()).toBe(true);
  });

  it('deve ignorar invocações subsequentes durante um encerramento em andamento', async () => {
    let executionCount = 0;

    const manager = new GracefulShutdownManager({
      exitProcessOnFinish: false,
    });

    manager.registerResource('Hook Lento', async () => {
      executionCount++;
      await new Promise((r) => setTimeout(r, 20));
    });

    // Dispara dois shutdowns quase simultâneos
    const p1 = manager.shutdown('SIGTERM');
    const p2 = manager.shutdown('SIGINT');

    await Promise.all([p1, p2]);

    expect(executionCount).toBe(1);
  });

  it('deve continuar a liberação de outros recursos mesmo se um hook falhar', async () => {
    const executed: string[] = [];
    let reportedExitCode: number | undefined;

    const manager = new GracefulShutdownManager({
      exitProcessOnFinish: false,
      onBeforeExit: (code) => {
        reportedExitCode = code;
      },
    });

    manager.registerResource(
      'Hook 1 (Sucesso)',
      () => {
        executed.push('hook-1');
      },
      10
    );

    manager.registerResource(
      'Hook 2 (Falha)',
      () => {
        executed.push('hook-2-fail');
        throw new Error('Falha simulada no fechamento do socket');
      },
      20
    );

    manager.registerResource(
      'Hook 3 (Sucesso)',
      () => {
        executed.push('hook-3');
      },
      30
    );

    await manager.shutdown('SIGINT');

    expect(executed).toEqual(['hook-1', 'hook-2-fail', 'hook-3']);
    // Como houve erro em um hook, exitCode deve ser 1
    expect(reportedExitCode).toBe(1);
  });

  it('deve integrar com Fastify e WorkerPool através de setupGracefulShutdown', async () => {
    const app = Fastify({ logger: false });
    let workerTerminated = false;

    const mockWorkerPool = {
      terminate: async () => {
        workerTerminated = true;
      },
    };

    let reportedCode: number | undefined;

    const manager = setupGracefulShutdown(app, {
      workerPool: mockWorkerPool,
      exitProcessOnFinish: false,
      onBeforeExit: (code) => {
        reportedCode = code;
      },
    });

    expect(manager.getRegisteredResources()).toHaveLength(2);

    await manager.shutdown('SIGTERM');

    expect(workerTerminated).toBe(true);
    expect(reportedCode).toBe(0);
  });

  it('deve disparar timeout e forçar saída quando um recurso trava além do limite', async () => {
    let timeoutReportedCode: number | undefined;

    const manager = new GracefulShutdownManager({
      timeoutMs: 50, // 50ms para teste rápido
      exitProcessOnFinish: false,
      onBeforeExit: (code) => {
        timeoutReportedCode = code;
      },
    });

    manager.registerResource('Recurso Travado Infinito', async () => {
      // Promessa pendente que nunca resolve
      await new Promise(() => {});
    });

    // Inicia shutdown sem aguardar para verificar o disparo do timeout
    void manager.shutdown('SIGTERM');

    // Aguarda mais que o tempo de timeout
    await new Promise((r) => setTimeout(r, 100));

    expect(timeoutReportedCode).toBe(1);
  });
});
