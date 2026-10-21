import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { WorkerPool } from '../src/workers/worker-pool.js';

describe('Experimento do Event Loop: Bloqueante vs. Worker Threads', () => {
  let app: FastifyInstance;
  let customPool: WorkerPool;
  let baseUrl: string;

  beforeAll(async () => {
    customPool = new WorkerPool({ size: 2 });
    app = buildApp({
      workerPool: customPool,
      logger: false,
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterAll(async () => {
    await app.close();
    await customPool.destroy();
  });

  it('Cenário A (Bloqueante): deve demonstrar que o cálculo síncrono congela o Event Loop e retém /health na fila', async () => {
    // 18 milhões de iterações levam ~250ms de CPU
    const iteracoesPesadas = 18_000_000;
    const urlBloqueante = `${baseUrl}/bloqueante?dimensaoGrid=40&iteracoes=${iteracoesPesadas}`;
    const urlHealth = `${baseUrl}/health`;

    const inicio = performance.now();
    let tempoHealthConcluidoMs = 0;
    let tempoBloqueanteConcluidoMs = 0;

    // Disparamos ambas as requisições simultaneamente
    const promessaBloqueante = fetch(urlBloqueante).then((res) => {
      tempoBloqueanteConcluidoMs = performance.now() - inicio;
      return res;
    });

    const promessaHealth = fetch(urlHealth).then((res) => {
      tempoHealthConcluidoMs = performance.now() - inicio;
      return res;
    });

    const [respostaBloqueante, respostaHealth] = await Promise.all([
      promessaBloqueante,
      promessaHealth,
    ]);

    expect(respostaBloqueante.status).toBe(200);
    expect(respostaHealth.status).toBe(200);

    const dadosHealth = (await respostaHealth.json()) as { status: string };
    expect(dadosHealth.status).toBe('ok');

    // Comprovação arquitetural:
    // O tempo de conclusão de ambas deve refletir a retenção na thread principal
    expect(tempoBloqueanteConcluidoMs).toBeGreaterThan(150);
    expect(tempoHealthConcluidoMs).toBeGreaterThan(100);
  });

  it('Cenário B (Worker Threads): deve demonstrar que /health responde instantaneamente enquanto o cálculo roda em paralelo', async () => {
    const iteracoesPesadas = 18_000_000;
    const urlOtimizada = `${baseUrl}/otimizada?dimensaoGrid=40&iteracoes=${iteracoesPesadas}`;
    const urlHealth = `${baseUrl}/health`;

    const inicio = performance.now();
    let tempoHealthConcluidoMs = 0;
    let tempoOtimizadaConcluidoMs = 0;

    const promessaOtimizada = fetch(urlOtimizada).then((res) => {
      tempoOtimizadaConcluidoMs = performance.now() - inicio;
      return res;
    });

    const promessaHealth = fetch(urlHealth).then((res) => {
      tempoHealthConcluidoMs = performance.now() - inicio;
      return res;
    });

    const [respostaOtimizada, respostaHealth] = await Promise.all([
      promessaOtimizada,
      promessaHealth,
    ]);

    expect(respostaOtimizada.status).toBe(200);
    expect(respostaHealth.status).toBe(200);

    const dadosOtimizada = (await respostaOtimizada.json()) as {
      cenario: string;
      resultado: { executadoEm: string };
    };
    expect(dadosOtimizada.cenario).toContain('Otimizada');
    expect(dadosOtimizada.resultado.executadoEm).toBe('worker-thread');

    // Comprovação arquitetural:
    // O /health respondeu com baixa latência (< 80ms),
    // enquanto o cálculo pesado em worker thread levou significativamente mais tempo (> 150ms)!
    expect(tempoHealthConcluidoMs).toBeLessThan(80);
    expect(tempoOtimizadaConcluidoMs).toBeGreaterThan(150);

    // O /health foi respondido ordens de magnitude mais rápido que o cálculo volumétrico
    expect(tempoOtimizadaConcluidoMs).toBeGreaterThan(tempoHealthConcluidoMs * 2);
  });
});
