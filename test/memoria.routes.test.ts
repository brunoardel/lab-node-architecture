import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { gerarArquivoEspacial } from '../src/domain/gerador-dados-espaciais.js';

describe('Rotas de Experimento de Memória (/memoria/*)', () => {
  let app: FastifyInstance;
  const dirTeste = path.resolve(process.cwd(), 'tmp', 'test-memoria-routes');
  const arquivoTeste = path.join(dirTeste, 'dados-teste-routes.ndjson');

  beforeAll(async () => {
    if (!fs.existsSync(dirTeste)) {
      fs.mkdirSync(dirTeste, { recursive: true });
    }
    await gerarArquivoEspacial({
      caminhoArquivo: arquivoTeste,
      tamanhoAlvoBytes: 250 * 1024, // 250 KB
    });

    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(dirTeste)) {
      fs.rmSync(dirTeste, { recursive: true, force: true });
    }
  });

  it('GET /memoria/status deve retornar uso de memória e lista de arquivos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/memoria/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('memoriaProcesso');
    expect(body.memoriaProcesso.rssMb).toBeGreaterThan(0);
    expect(body).toHaveProperty('arquivosDisponiveis');
    expect(Array.isArray(body.arquivosDisponiveis)).toBe(true);
  });

  it('POST /memoria/buffer deve processar com Buffer e retornar métricas de memória', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/memoria/buffer',
      payload: {
        tamanhoMb: 1,
        arquivoEntrada: arquivoTeste,
        gerarSeNaoExistir: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cenario).toContain('Buffer Ingênuo');
    expect(body.resultado).toHaveProperty('memoria');
    expect(body.resultado.memoria.pico.rssMb).toBeGreaterThan(0);
    expect(body.resultado.totalRegistrosProcessados).toBeGreaterThan(0);
  });

  it('GET /memoria/buffer deve aceitar query params', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/memoria/buffer?arquivoEntrada=${encodeURIComponent(arquivoTeste)}&gerarSeNaoExistir=false&tamanhoMb=1`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cenario).toContain('Buffer');
  });

  it('POST /memoria/stream deve processar com Streams e retornar métricas estáveis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/memoria/stream',
      payload: {
        tamanhoMb: 1,
        arquivoEntrada: arquivoTeste,
        gerarSeNaoExistir: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cenario).toContain('Streams');
    expect(body.resultado).toHaveProperty('memoria');
    expect(body.resultado.memoria.pico.rssMb).toBeGreaterThan(0);
    expect(body.resultado.totalRegistrosProcessados).toBeGreaterThan(0);
  });

  it('GET /memoria/stream deve aceitar query params', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/memoria/stream?arquivoEntrada=${encodeURIComponent(arquivoTeste)}&gerarSeNaoExistir=false&tamanhoMb=1`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cenario).toContain('Streams');
  });

  it('POST /memoria/gerar-arquivo deve permitir criar arquivo sintético com sucesso', async () => {
    const caminhoGerado = path.join(dirTeste, 'gerado-via-api.ndjson');

    const response = await app.inject({
      method: 'POST',
      url: '/memoria/gerar-arquivo',
      payload: {
        tamanhoMb: 1,
        caminhoArquivo: caminhoGerado,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('criado');
    expect(fs.existsSync(caminhoGerado)).toBe(true);
  });

  it('deve retornar 400 se parâmetros forem inválidos (validação Zod)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/memoria/buffer',
      payload: {
        tamanhoMb: -10, // Inválido: menor que 1
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Bad Request');
    expect(body.issues).toBeDefined();
  });
});
