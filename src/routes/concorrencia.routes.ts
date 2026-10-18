import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { executarCalculoVolumetria } from '../domain/volumetria.service.js';
import { parseVolumetriaInput } from '../schemas/volumetria.schema.js';
import { getDefaultWorkerPool, WorkerPool } from '../workers/worker-pool.js';

export interface ConcorrenciaRoutesOptions {
  workerPool?: WorkerPool;
}

export const concorrenciaRoutes: FastifyPluginAsync<ConcorrenciaRoutesOptions> = async (
  app,
  opts
) => {
  const pool = opts.workerPool ?? getDefaultWorkerPool();

  function extrairParametros(request: { query: unknown; body: unknown }) {
    // Mescla query params e body (se houver)
    const raw = {
      ...(typeof request.query === 'object' && request.query !== null ? request.query : {}),
      ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
    };
    return parseVolumetriaInput(raw);
  }

  /**
   * Cenário A: Rota Bloqueante
   * Executa o cálculo pesado de volumetria de forma síncrona diretamente na Thread Principal (Event Loop).
   * Isso congela todo o processamento de I/O do Node.js durante os 2 a 3 segundos de execução.
   */
  const handleBloqueante = async (request: any, reply: any) => {
    try {
      const params = extrairParametros(request);
      const resultado = executarCalculoVolumetria(params);
      return reply.status(200).send({
        cenario: 'A (Bloqueante - Main Thread)',
        aviso: 'O Event Loop esteve CONGELADO durante a execução deste cálculo.',
        resultado,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Parâmetros de volumetria inválidos',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro no cálculo bloqueante',
      });
    }
  };

  app.get('/bloqueante', handleBloqueante);
  app.post('/bloqueante', handleBloqueante);

  /**
   * Cenário B: Rota Otimizada
   * Encaminha o cálculo pesado de volumetria para o WorkerPool via node:worker_threads.
   * A thread principal permanece 100% livre e responsiva para atender outras requisições (como /health).
   */
  const handleOtimizada = async (request: any, reply: any) => {
    try {
      const params = extrairParametros(request);
      const resultado = await pool.execute(params);
      return reply.status(200).send({
        cenario: 'B (Otimizada - Worker Threads Pool)',
        aviso: 'O Event Loop permaneceu 100% LIVRE. Outras requisições responderam sem atraso.',
        poolStats: pool.stats(),
        resultado,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Parâmetros de volumetria inválidos',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro na Worker Thread',
      });
    }
  };

  app.get('/otimizada', handleOtimizada);
  app.post('/otimizada', handleOtimizada);

  /**
   * Observabilidade: Estado em tempo real do Worker Pool
   */
  app.get('/concorrencia/pool-stats', async (_request, reply) => {
    return reply.status(200).send({
      timestamp: new Date().toISOString(),
      stats: pool.stats(),
    });
  });
};
