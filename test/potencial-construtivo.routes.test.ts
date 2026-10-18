import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Rotas de Potencial Construtivo (Zod & Fastify)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/zoneamento/calcular retorna 200 com payload válido residencial', async () => {
    const payload = {
      projetoId: 'proj-001',
      usuarioId: 'user-001',
      areaTerreno: 800,
      testadaPrincipal: 20,
      regraZoneamento: {
        tipo: 'residencial',
        coeficienteAproveitamento: 2,
        taxaOcupacaoMaxima: 0.5,
        recuoFrontalMinimo: 5,
        numeroMaximoPavimentos: 4,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/zoneamento/calcular',
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toMatchObject({
      projetoId: 'proj-001',
      usuarioId: 'user-001',
      areaTerreno: 800,
      areaConstruivelMaxima: 1600,
      areaOcupacaoMaxima: 400,
      detalhes: {
        tipo: 'residencial',
        numeroMaximoPavimentos: 4,
        areaEstimadaPorPavimento: 400,
      },
    });
  });

  it('POST /api/zoneamento/calcular retorna 200 com payload válido comercial', async () => {
    const payload = {
      projetoId: 'proj-002',
      usuarioId: 'user-002',
      areaTerreno: 1200,
      testadaPrincipal: 25,
      regraZoneamento: {
        tipo: 'comercial',
        coeficienteAproveitamento: 3,
        taxaOcupacaoMaxima: 0.7,
        recuoFrontalMinimo: 4,
        vagasPorCemM2: 3,
        adicionalSobreloja: true,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/zoneamento/calcular',
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toMatchObject({
      projetoId: 'proj-002',
      areaConstruivelMaxima: 3600,
      areaOcupacaoMaxima: 840,
      detalhes: {
        tipo: 'comercial',
        vagasObrigatorias: 108,
        bonusSobrelojaAplicado: true,
      },
    });
  });

  it('POST /api/zoneamento/calcular retorna 200 com payload válido industrial', async () => {
    const payload = {
      projetoId: 'proj-003',
      usuarioId: 'user-003',
      areaTerreno: 4000,
      testadaPrincipal: 40,
      regraZoneamento: {
        tipo: 'industrial',
        coeficienteAproveitamento: 1.2,
        taxaOcupacaoMaxima: 0.6,
        recuoFrontalMinimo: 8,
        recuoLateralMinimo: 4,
        fatorEmissaoPoluentesMaximo: 2,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/zoneamento/calcular',
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toMatchObject({
      projetoId: 'proj-003',
      areaConstruivelMaxima: 4800,
      areaOcupacaoMaxima: 2400,
      detalhes: {
        tipo: 'industrial',
        recuoLateralObrigatorio: 4,
        fatorPoluicaoPermitido: 2,
        areaPatioManobraEstimada: 800,
      },
    });
  });

  it('POST /api/zoneamento/calcular retorna 400 quando tipo de zoneamento é inválido', async () => {
    const payload = {
      projetoId: 'proj-004',
      usuarioId: 'user-004',
      areaTerreno: 500,
      testadaPrincipal: 15,
      regraZoneamento: {
        tipo: 'rural', // tipo não suportado no discriminatedUnion
        coeficienteAproveitamento: 1,
        taxaOcupacaoMaxima: 0.3,
        recuoFrontalMinimo: 10,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/zoneamento/calcular',
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(400);
    expect(body.message).toMatch(/Falha na validação/);
    expect(body.issues).toBeDefined();
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('POST /api/zoneamento/calcular retorna 400 quando faltam campos obrigatórios específicos do tipo', async () => {
    // Zona industrial sem recuoLateralMinimo obrigatório
    const payload = {
      projetoId: 'proj-005',
      usuarioId: 'user-005',
      areaTerreno: 3000,
      testadaPrincipal: 30,
      regraZoneamento: {
        tipo: 'industrial',
        coeficienteAproveitamento: 1.5,
        taxaOcupacaoMaxima: 0.5,
        recuoFrontalMinimo: 10,
        // recuoLateralMinimo ausente
        fatorEmissaoPoluentesMaximo: 3,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/zoneamento/calcular',
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(400);
    expect(body.issues.some((i: { path: string }) => i.path.includes('recuoLateralMinimo'))).toBe(true);
  });

  it('POST /api/zoneamento/calcular retorna 400 para grandezas numéricas inválidas (negativas ou fora do limite)', async () => {
    const payload = {
      projetoId: 'proj-006',
      usuarioId: 'user-006',
      areaTerreno: -500, // negativo
      testadaPrincipal: 0, // zero
      regraZoneamento: {
        tipo: 'residencial',
        coeficienteAproveitamento: 2,
        taxaOcupacaoMaxima: 1.5, // > 1.0 (100%)
        recuoFrontalMinimo: -2, // negativo
        numeroMaximoPavimentos: 0, // zero
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/zoneamento/calcular',
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(400);
    expect(body.issues.length).toBeGreaterThanOrEqual(4);
  });
});
