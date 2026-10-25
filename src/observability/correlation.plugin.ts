import crypto from 'node:crypto';
import { FastifyPluginAsync } from 'fastify';
import {
  createCorrelationContext,
  runWithCorrelationContext,
} from './correlation-context.js';
import { appLogger } from './logger.js';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    requestStartTime: number;
  }
}

export interface CorrelationPluginOptions {
  headerName?: string;
  enableHttpLogging?: boolean;
}

const correlationPluginAsync: FastifyPluginAsync<CorrelationPluginOptions> = async (
  app,
  opts
) => {
  const headerName = (opts.headerName ?? 'x-correlation-id').toLowerCase();
  const enableHttpLogging = opts.enableHttpLogging ?? true;

  // Hook inicial de requisição: inicializa o contexto assíncrono no AsyncLocalStorage
  app.addHook('onRequest', (request, reply, done) => {
    const rawHeader =
      request.headers[headerName] ??
      request.headers['x-request-id'] ??
      request.headers['correlation-id'];

    const correlationId =
      typeof rawHeader === 'string' && rawHeader.trim().length > 0
        ? rawHeader.trim()
        : crypto.randomUUID();

    const startTime = Date.now();
    request.correlationId = correlationId;
    request.requestStartTime = startTime;

    // Injeta cabeçalho de resposta imediatamente
    reply.header('x-correlation-id', correlationId);

    const context = createCorrelationContext({
      correlationId,
      method: request.method,
      path: request.url,
    });

    // Propaga o contexto assíncrono para todos os hooks e handlers subsequentes
    runWithCorrelationContext(context, () => {
      done();
    });
  });

  if (enableHttpLogging) {
    app.addHook('onResponse', async (request, reply) => {
      const durationMs = Date.now() - (request.requestStartTime || Date.now());
      appLogger.info('HTTP Request Finalizada', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
      });
    });
  }
};

export const correlationPlugin = correlationPluginAsync;
(correlationPlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
