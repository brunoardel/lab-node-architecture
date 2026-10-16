import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';

export interface BuildAppOptions extends FastifyServerOptions {}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    ...options,
  });

  // Base Healthcheck Route
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
