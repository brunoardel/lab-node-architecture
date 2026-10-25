import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Rotas de Observabilidade e Rastreamento Multi-Camadas (Tarefa 5)', () => {
  const app = buildApp({ logger: false });

  afterAll(async () => {
    await app.close();
  });

  it('deve gerar UUID automático e rastrear Controller -> Service -> Repository quando header não é fornecido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/observabilidade/rastreamento-camadas',
      payload: {
        nome: 'Residencial Aurora',
        tipoZoneamento: 'Residencial',
        areaTerrenoM2: 500,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();

    expect(body.correlationId).toBeDefined();
    expect(response.headers['x-correlation-id']).toBe(body.correlationId);
    expect(body.camadasAuditadas).toEqual(['Controller', 'Service', 'Repository']);
    expect(body.totalLogsRegistrados).toBeGreaterThanOrEqual(3);

    // Todos os logs emitidos no ciclo de vida devem carregar o exato mesmo correlationId
    for (const log of body.logs) {
      expect(log.correlationId).toBe(body.correlationId);
    }
  });

  it('deve preservar e propagar o correlationId fornecido pelo cliente no header x-correlation-id', async () => {
    const customCorrelationId = 'client-custom-corr-uuid-99999';

    const response = await app.inject({
      method: 'POST',
      url: '/api/observabilidade/rastreamento-camadas',
      headers: {
        'x-correlation-id': customCorrelationId,
      },
      payload: {
        nome: 'Complexo Comercial Plaza',
        tipoZoneamento: 'Comercial',
        areaTerrenoM2: 1200,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();

    expect(body.correlationId).toBe(customCorrelationId);
    expect(response.headers['x-correlation-id']).toBe(customCorrelationId);

    // Confirma que os logs de todas as camadas (sem req repassado!) usaram o correlationId customizado
    for (const log of body.logs) {
      expect(log.correlationId).toBe(customCorrelationId);
    }
  });

  it('GET /api/observabilidade/contexto deve retornar o contexto ativo da requisição', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/observabilidade/contexto',
      headers: { 'x-correlation-id': 'test-context-inspection' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.correlationId).toBe('test-context-inspection');
    expect(body.contextoAtivo.correlationId).toBe('test-context-inspection');
    expect(body.contextoAtivo.method).toBe('GET');
    expect(body.contextoAtivo.path).toBe('/api/observabilidade/contexto');
  });

  it('GET /api/observabilidade/simular-erro-dominio deve retornar 400 com DomainError serializado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/observabilidade/simular-erro-dominio',
      headers: { 'x-correlation-id': 'test-domain-error' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();

    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('REGRA_INVALIDA');
    expect(body.correlationId).toBe('test-domain-error');
    expect(body.detalhes).toBeDefined();
    expect(body.stack).toBeUndefined();
  });

  it('GET /api/observabilidade/simular-erro-infra deve retornar 500 com InfraError sanitizado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/observabilidade/simular-erro-infra',
      headers: { 'x-correlation-id': 'test-infra-error' },
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();

    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('WORKER_POOL_FALHA');
    expect(body.correlationId).toBe('test-infra-error');
    expect(body.stack).toBeUndefined();
  });

  it('GET /api/observabilidade/simular-erro-inesperado deve retornar 500 sem vazar stack trace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/observabilidade/simular-erro-inesperado',
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();

    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('ERRO_INTERNO_INESPERADO');
    expect(body.message).toContain('erro interno no servidor');
    expect(body.stack).toBeUndefined();
  });

  it('GET /api/observabilidade/projetos/:id deve retornar 404 quando o projeto não existe', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/observabilidade/projetos/id-inexistente-12345',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();

    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('PROJETO_NAO_ENCONTRADO');
    expect(body.detalhes?.projetoId).toBe('id-inexistente-12345');
    expect(body.stack).toBeUndefined();
  });
});
