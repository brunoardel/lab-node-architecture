import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { WorkerPool } from '../src/workers/worker-pool.js';

describe('Rotas de Concorrência e Offloading (/bloqueante e /otimizada)', () => {
  let app: FastifyInstance;
  let customPool: WorkerPool;

  beforeAll(async () => {
    customPool = new WorkerPool({ size: 2 });
    app = buildApp({ workerPool: customPool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await customPool.destroy();
  });

  it('GET /bloqueante deve responder com sucesso informando execução na main-thread', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/bloqueante?dimensaoGrid=20&iteracoes=5000',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cenario).toContain('Bloqueante');
    expect(body.resultado.executadoEm).toBe('main-thread');
    expect(body.resultado.threadId).toBe(0);
    expect(body.resultado.pontosProcessados).toBe(400);
  });

  it('POST /bloqueante com payload JSON deve executar e validar parâmetros', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/bloqueante',
      payload: {
        dimensaoGrid: 25,
        cotaProjeto: 18.5,
        iteracoes: 3000,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.resultado.cotaMediaTerrenoM).toBeGreaterThan(0);
  });

  it('GET /otimizada deve executar via Worker Threads Pool com threadId > 0', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/otimizada?dimensaoGrid=20&iteracoes=5000',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cenario).toContain('Otimizada');
    expect(body.resultado.executadoEm).toBe('worker-thread');
    expect(body.resultado.threadId).toBeGreaterThan(0);
    expect(body.poolStats).toBeDefined();
    expect(body.poolStats.totalWorkers).toBe(2);
  });

  it('POST /otimizada deve retornar resultado de cálculo volumétrico em background', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/otimizada',
      payload: {
        dimensaoGrid: 30,
        fatorEmpolamento: 1.3,
        iteracoes: 4000,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.resultado.volumeCorteM3).toBeGreaterThan(0);
    expect(body.resultado.executadoEm).toBe('worker-thread');
  });

  it('GET /concorrencia/pool-stats deve retornar métricas em tempo real do Worker Pool', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/concorrencia/pool-stats',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stats.totalWorkers).toBe(2);
    expect(body.stats.idleWorkers).toBeLessThanOrEqual(2);
    expect(body.stats.queueLength).toBe(0);
  });

  it('deve retornar HTTP 400 se os parâmetros forem inválidos segundo o schema Zod', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/bloqueante?dimensaoGrid=2', // Mínimo é 10
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Bad Request');
    expect(body.issues).toBeDefined();
    expect(body.issues[0].message).toMatch(/mínimo/i);
  });
});
