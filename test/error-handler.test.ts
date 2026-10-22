import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { correlationPlugin } from '../src/observability/correlation.plugin.js';
import { errorHandlerPlugin } from '../src/errors/error-handler.plugin.js';
import {
  DomainError,
  RegraInvalidaError,
  ZoneamentoNaoSuportadoError,
  ProjetoNaoEncontradoError,
  InfraError,
  WorkerPoolFalhaError,
  TimeoutProcessamentoError,
} from '../src/errors/app-error.js';

describe('Centralized Error Handler Plugin (RF05)', () => {
  const app = Fastify({ logger: false });

  app.register(correlationPlugin, { enableHttpLogging: false });
  app.register(errorHandlerPlugin);

  // Rotas de teste simulando diferentes categorias de erro
  app.get('/test/zod-error', async () => {
    const schema = z.object({
      taxaOcupacao: z.number().max(1, 'Taxa não pode exceder 1.0'),
    });
    schema.parse({ taxaOcupacao: 2.5 });
  });

  app.get('/test/domain-error-400', async () => {
    throw new RegraInvalidaError('Recuo frontal de 1.5m é inferior ao mínimo obrigatório de 4.0m', {
      recuoInformado: 1.5,
      recuoMinimo: 4.0,
    });
  });

  app.get('/test/domain-error-422', async () => {
    throw new ZoneamentoNaoSuportadoError('AgropecuariaExtensiva');
  });

  app.get('/test/domain-error-404', async () => {
    throw new ProjetoNaoEncontradoError('proj-xyz-999');
  });

  app.get('/test/infra-error-500', async () => {
    throw new WorkerPoolFalhaError('Worker Thread abortou com SIGSEGV');
  });

  app.get('/test/infra-error-504', async () => {
    throw new TimeoutProcessamentoError('CalculoVolumetria', 3000);
  });

  app.get('/test/unexpected-error', async () => {
    throw new Error('Falha catastrófica não prevista na memória');
  });

  afterAll(async () => {
    await app.close();
  });

  it('deve interceptar ZodError e retornar HTTP 400 com lista de issues e sem vazar stack trace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/zod-error',
      headers: { 'x-correlation-id': 'corr-zod-01' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(body.code).toBe('VALIDACAO_FALHOU');
    expect(body.correlationId).toBe('corr-zod-01');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues[0]?.message).toBe('Taxa não pode exceder 1.0');
    expect(response.headers['x-correlation-id']).toBe('corr-zod-01');
    expect(body.stack).toBeUndefined();
  });

  it('deve interceptar DomainError (HTTP 400) com detalhes de negócio sem stack trace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/domain-error-400',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();

    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('REGRA_INVALIDA');
    expect(body.message).toContain('Recuo frontal de 1.5m é inferior ao mínimo obrigatório');
    expect(body.detalhes).toEqual({ recuoInformado: 1.5, recuoMinimo: 4.0 });
    expect(body.correlationId).toBeDefined();
    expect(body.stack).toBeUndefined();
  });

  it('deve interceptar ZoneamentoNaoSuportadoError e retornar HTTP 422', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/domain-error-422',
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();

    expect(body.statusCode).toBe(422);
    expect(body.code).toBe('ZONEAMENTO_NAO_SUPORTADO');
    expect(body.message).toContain('AgropecuariaExtensiva');
    expect(body.stack).toBeUndefined();
  });

  it('deve interceptar ProjetoNaoEncontradoError e retornar HTTP 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/domain-error-404',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();

    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('PROJETO_NAO_ENCONTRADO');
    expect(body.message).toContain('proj-xyz-999');
    expect(body.stack).toBeUndefined();
  });

  it('deve interceptar InfraError (HTTP 500) retornando payload sanitizado e sem vazar stack trace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/infra-error-500',
      headers: { 'x-correlation-id': 'corr-infra-500' },
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();

    expect(body.statusCode).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(body.code).toBe('WORKER_POOL_FALHA');
    expect(body.message).toBe('Worker Thread abortou com SIGSEGV');
    expect(body.correlationId).toBe('corr-infra-500');
    expect(response.headers['x-correlation-id']).toBe('corr-infra-500');
    // Verificação estrita de segurança: stack trace NUNCA deve vazar na resposta HTTP
    expect(body.stack).toBeUndefined();
  });

  it('deve interceptar TimeoutProcessamentoError e retornar HTTP 504 Gateway Timeout', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/infra-error-504',
    });

    expect(response.statusCode).toBe(504);
    const body = response.json();

    expect(body.statusCode).toBe(504);
    expect(body.code).toBe('TIMEOUT_PROCESSAMENTO');
    expect(body.stack).toBeUndefined();
  });

  it('deve sanitizar erros inesperados não tratados em HTTP 500 genérico sem vazar mensagem sensível ou stack', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/unexpected-error',
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();

    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('ERRO_INTERNO_INESPERADO');
    expect(body.message).toBe('Ocorreu um erro interno no servidor ao processar a requisição.');
    expect(body.correlationId).toBeDefined();
    expect(body.stack).toBeUndefined();
  });
});
