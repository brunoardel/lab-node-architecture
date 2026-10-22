import { FastifyError, FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, InfraError } from './app-error.js';
import { appLogger } from '../observability/logger.js';
import { getCorrelationId } from '../observability/correlation-context.js';

export interface ErrorResponsePayload {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  correlationId: string;
  timestamp: string;
  issues?: Array<{ path: string; message: string }>;
  detalhes?: unknown;
}

export const errorHandlerPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const correlationId = request.correlationId ?? getCorrelationId() ?? 'sem-correlation-id';
    const timestamp = new Date().toISOString();

    // Garante cabeçalho na resposta
    reply.header('x-correlation-id', correlationId);

    // 1. Tratamento de Erros de Validação Zod (Borda HTTP)
    if (error instanceof ZodError) {
      appLogger.warn('Validação de payload falhou na borda da API', {
        error: error.message,
        url: request.url,
        method: request.method,
      });

      const payload: ErrorResponsePayload = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDACAO_FALHOU',
        message: 'Falha na validação dos dados de entrada',
        correlationId,
        timestamp,
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };

      return reply.status(400).send(payload);
    }

    // 2. Tratamento de Erros de Domínio (HTTP 4xx - Regras de Negócio)
    if (error instanceof DomainError) {
      appLogger.warn(`Erro de domínio capturado: [${error.code}] ${error.message}`, {
        errorCode: error.code,
        statusCode: error.statusCode,
        detalhes: error.details,
      });

      const payload: ErrorResponsePayload = {
        statusCode: error.statusCode,
        error: error.name,
        code: error.code,
        message: error.message,
        correlationId,
        timestamp,
        ...(error.details !== undefined ? { detalhes: error.details } : {}),
      };

      return reply.status(error.statusCode).send(payload);
    }

    // 3. Tratamento de Erros de Infraestrutura (HTTP 5xx - I/O, Workers, Conexões)
    if (error instanceof InfraError) {
      // Registra integralmente a stack trace internamente no logger estruturado
      appLogger.error(`Erro de infraestrutura capturado: [${error.code}] ${error.message}`, error);

      // Resposta sanitizada enviada ao cliente sem vazar stack trace
      const payload: ErrorResponsePayload = {
        statusCode: error.statusCode,
        error: 'Internal Server Error',
        code: error.code,
        message: error.message,
        correlationId,
        timestamp,
      };

      return reply.status(error.statusCode).send(payload);
    }

    // 4. Tratamento de Erros Nativos do Fastify (ex: 400 Bad Request por JSON inválido, 404, etc.)
    const fastifyStatusCode = (error as FastifyError).statusCode;
    if (typeof fastifyStatusCode === 'number' && fastifyStatusCode < 500) {
      appLogger.warn(`Erro de requisição HTTP [${fastifyStatusCode}]: ${error.message}`, {
        statusCode: fastifyStatusCode,
        code: (error as FastifyError).code,
      });

      const payload: ErrorResponsePayload = {
        statusCode: fastifyStatusCode,
        error: error.name || 'Client Error',
        code: (error as FastifyError).code || 'HTTP_CLIENT_ERROR',
        message: error.message,
        correlationId,
        timestamp,
      };

      return reply.status(fastifyStatusCode).send(payload);
    }

    // 5. Erros Inesperados / Não Tratados (HTTP 500)
    // Registra stack trace completa para auditoria interna
    appLogger.error(`Erro não tratado / inesperado na requisição: ${error.message}`, error);

    // Resposta genérica e segura, sem expor detalhes internos ou stack traces
    const payload: ErrorResponsePayload = {
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'ERRO_INTERNO_INESPERADO',
      message: 'Ocorreu um erro interno no servidor ao processar a requisição.',
      correlationId,
      timestamp,
    };

    return reply.status(500).send(payload);
  });
};

(errorHandlerPlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
