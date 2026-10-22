import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { potencialConstrutivoRoutes } from './routes/potencial-construtivo.routes.js';
import { concorrenciaRoutes } from './routes/concorrencia.routes.js';
import { memoriaRoutes } from './routes/memoria.routes.js';
import { WorkerPool } from './workers/worker-pool.js';

export interface BuildAppOptions extends FastifyServerOptions {
  workerPool?: WorkerPool;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const { workerPool, ...fastifyOptions } = options;

  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    ...fastifyOptions,
  });

  // Base Healthcheck Route
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Rotas de Domínio Urbanístico
  app.register(potencialConstrutivoRoutes);

  // Rotas do Experimento do Event Loop (Tarefa 3)
  app.register(concorrenciaRoutes, { workerPool });

  // Rotas do Experimento de Memória: Buffer vs. Streams (Tarefa 4)
  app.register(memoriaRoutes);

  return app;
}

