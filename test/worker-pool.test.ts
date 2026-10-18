import { describe, it, expect, afterEach } from 'vitest';
import { WorkerPool } from '../src/workers/worker-pool.js';

describe('WorkerPool de Alta Performance e Concorrência', () => {
  let pool: WorkerPool | null = null;

  afterEach(async () => {
    if (pool) {
      await pool.destroy();
      pool = null;
    }
  });

  it('deve inicializar o pool com o tamanho configurado e workers ociosos', () => {
    pool = new WorkerPool({ size: 2 });
    const stats = pool.stats();

    expect(stats.totalWorkers).toBe(2);
    expect(stats.busyWorkers).toBe(0);
    expect(stats.idleWorkers).toBe(2);
    expect(stats.queueLength).toBe(0);
  });

  it('deve executar o cálculo pesado em uma Worker Thread secundária com threadId > 0', async () => {
    pool = new WorkerPool({ size: 2 });

    const resultado = await pool.execute({
      dimensaoGrid: 40,
      cotaProjeto: 20.0,
      iteracoes: 5_000,
    });

    expect(resultado).toBeDefined();
    expect(resultado.pontosProcessados).toBe(1600);
    expect(resultado.executadoEm).toBe('worker-thread');
    expect(resultado.threadId).toBeGreaterThan(0);
  });

  it('deve processar múltiplas tarefas concorrentes e enfileirar o excedente na fila FIFO', async () => {
    // Pool pequeno com 2 workers
    pool = new WorkerPool({ size: 2 });

    // Disparar 6 tarefas simultâneas
    const promises = Array.from({ length: 6 }, (_, index) =>
      pool!.execute({
        dimensaoGrid: 30,
        cotaProjeto: 15.0 + index,
        iteracoes: 10_000,
      })
    );

    const resultados = await Promise.all(promises);

    expect(resultados).toHaveLength(6);
    for (const res of resultados) {
      expect(res.executadoEm).toBe('worker-thread');
      expect(res.threadId).toBeGreaterThan(0);
    }

    // Após o término de todas, todos os workers devem estar ociosos e a fila vazia
    const finalStats = pool.stats();
    expect(finalStats.busyWorkers).toBe(0);
    expect(finalStats.idleWorkers).toBe(2);
    expect(finalStats.queueLength).toBe(0);
  });

  it('deve rejeitar tarefas pendentes e novas chamadas quando o pool for destruído', async () => {
    pool = new WorkerPool({ size: 1 });

    const promessaErro = pool
      .execute({
        dimensaoGrid: 50,
        iteracoes: 5_000_000, // tarefa mais longa
      })
      .catch((err) => err);

    await pool.destroy();

    // Novas chamadas devem ser rejeitadas imediatamente
    await expect(pool.execute({ iteracoes: 100 })).rejects.toThrow(/destruído/i);

    // Tarefa em andamento deve ter sido rejeitada pelo destroy
    const erroRecebido = await promessaErro;
    expect(erroRecebido).toBeInstanceOf(Error);
    expect(erroRecebido.message).toMatch(/destruído/i);
  });
});
