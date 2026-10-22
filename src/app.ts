import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { potencialConstrutivoRoutes } from './routes/potencial-construtivo.routes.js';
import { concorrenciaRoutes } from './routes/concorrencia.routes.js';
import { memoriaRoutes } from './routes/memoria.routes.js';
import { observabilidadeRoutes } from './routes/observabilidade.routes.js';
import { correlationPlugin } from './observability/correlation.plugin.js';
import { errorHandlerPlugin } from './errors/error-handler.plugin.js';
import { WorkerPool } from './workers/worker-pool.js';

export interface BuildAppOptions extends FastifyServerOptions {
  workerPool?: WorkerPool;
  enableHttpLogging?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const { workerPool, enableHttpLogging = false, ...fastifyOptions } = options;

  const app = Fastify({
    logger: false, // Usamos o StructuredLogger integrado ao AsyncLocalStorage
    ...fastifyOptions,
  });

  // 1. Rastreabilidade com AsyncLocalStorage (Correlation ID) - Tarefa 5 (RF04)
  app.register(correlationPlugin, { enableHttpLogging });

  // 2. Resiliência: Tratamento Centralizado de Erros (DomainError vs InfraError) - Tarefa 5 (RF05)
  app.register(errorHandlerPlugin);

  // 3. Base Healthcheck Route
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Rotas de Domínio Urbanístico (Tarefa 2)
  app.register(potencialConstrutivoRoutes);

  // 5. Rotas do Experimento do Event Loop (Tarefa 3)
  app.register(concorrenciaRoutes, { workerPool });

  // 6. Rotas do Experimento de Memória: Buffer vs. Streams (Tarefa 4)
  app.register(memoriaRoutes);

  // 7. Rotas de Observabilidade e Auditoria Multi-camadas (Tarefa 5)
  app.register(observabilidadeRoutes);

  return app;
}
