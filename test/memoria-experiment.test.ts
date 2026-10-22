import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { gerarArquivoEspacial } from '../src/domain/gerador-dados-espaciais.js';

describe('Experimento de Memória: Buffer vs. Streams com Backpressure', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const dirTeste = path.resolve(process.cwd(), 'tmp', 'test-memoria-experiment');
  const arquivoEntrada = path.join(dirTeste, 'dados-espaciais-5mb.ndjson');

  beforeAll(async () => {
    if (!fs.existsSync(dirTeste)) {
      fs.mkdirSync(dirTeste, { recursive: true });
    }

    // Gera arquivo de teste de ~5 MB para demonstrar na prática a diferença de alocação
    await gerarArquivoEspacial({
      caminhoArquivo: arquivoEntrada,
      tamanhoAlvoBytes: 5 * 1024 * 1024,
    });

    app = buildApp({ logger: false });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(dirTeste)) {
      fs.rmSync(dirTeste, { recursive: true, force: true });
    }
  });

  it('Cenário A (Buffer Ingênuo): deve ler arquivo completo e registrar alocação no RSS e Heap', async () => {
    const res = await fetch(`${baseUrl}/memoria/buffer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arquivoEntrada,
        gerarSeNaoExistir: false,
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    expect(json.cenario).toContain('Buffer Ingênuo');
    expect(json.resultado.totalRegistrosProcessados).toBeGreaterThan(10000);
    expect(json.resultado.tamanhoArquivoMb).toBeGreaterThanOrEqual(4.9);

    // O pico de memória reflete a alocação do buffer e objetos V8
    expect(json.resultado.memoria.pico.rssMb).toBeGreaterThan(0);
    expect(json.resultado.memoria.pico.heapUsedMb).toBeGreaterThan(0);
  });

  it('Cenário B (Streams com Backpressure): deve processar o arquivo com chunks de 64KB mantendo estabilidade', async () => {
    const res = await fetch(`${baseUrl}/memoria/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arquivoEntrada,
        gerarSeNaoExistir: false,
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    expect(json.cenario).toContain('Streams');
    expect(json.resultado.totalRegistrosProcessados).toBeGreaterThan(10000);
    expect(json.resultado.tamanhoArquivoMb).toBeGreaterThanOrEqual(4.9);

    // Na stream, a memória permanece estável
    expect(json.resultado.memoria.pico.rssMb).toBeGreaterThan(0);
    expect(json.resultado.memoria.pico.heapUsedMb).toBeGreaterThan(0);
  });
});
