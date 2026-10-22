import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, it, expect } from 'vitest';
import { TransformadorEspacialStream } from '../src/domain/transformador-espacial.stream.js';
import { PontoEspacialInput, PontoEspacialProcessado } from '../src/domain/dados-espaciais.types.js';

describe('TransformadorEspacialStream', () => {
  it('deve transformar registros NDJSON em stream preservando integridade', async () => {
    const pontos: PontoEspacialInput[] = [
      {
        id: 'P-1',
        projetoId: 'PRJ-1',
        latitude: -23.55,
        longitude: -46.63,
        elevacao: 500,
        zoneamento: 'Residencial',
        areaLoteM2: 500,
        taxaOcupacao: 0.6,
      },
      {
        id: 'P-2',
        projetoId: 'PRJ-1',
        latitude: -23.56,
        longitude: -46.64,
        elevacao: 900,
        zoneamento: 'Comercial',
        areaLoteM2: 1000,
        taxaOcupacao: 0.7,
      },
      {
        id: 'P-3',
        projetoId: 'PRJ-2',
        latitude: -23.57,
        longitude: -46.65,
        elevacao: 1200,
        zoneamento: 'Industrial',
        areaLoteM2: 2000,
        taxaOcupacao: 0.5,
      },
    ];

    const ndjsonInput = pontos.map((p) => JSON.stringify(p)).join('\n') + '\n';
    const readable = Readable.from([ndjsonInput]);
    const transformador = new TransformadorEspacialStream();

    const chunksSaida: string[] = [];
    transformador.on('data', (chunk) => {
      chunksSaida.push(chunk.toString());
    });

    await pipeline(readable, transformador);

    const saidaCompleta = chunksSaida.join('');
    const linhas = saidaCompleta.trim().split('\n');

    expect(linhas.length).toBe(3);
    expect(transformador.registrosProcessados).toBe(3);

    const r1 = JSON.parse(linhas[0]!) as PontoEspacialProcessado;
    expect(r1.id).toBe('P-1');
    expect(r1.categoriaDeclividade).toBe('Plano');
    expect(r1.riscoGeotecnico).toBe('Baixo');
    expect(r1.potencialConstrutivoMaxM2).toBe(1000); // 500 * 2.0 * 1.0

    const r2 = JSON.parse(linhas[1]!) as PontoEspacialProcessado;
    expect(r2.id).toBe('P-2');
    expect(r2.categoriaDeclividade).toBe('Ondulado');
    expect(r2.riscoGeotecnico).toBe('Medio');
    expect(r2.potencialConstrutivoMaxM2).toBe(2975); // 1000 * 3.5 * 0.85

    const r3 = JSON.parse(linhas[2]!) as PontoEspacialProcessado;
    expect(r3.id).toBe('P-3');
    expect(r3.categoriaDeclividade).toBe('Escarpado');
    expect(r3.riscoGeotecnico).toBe('Alto');
    expect(r3.potencialConstrutivoMaxM2).toBe(1200); // 2000 * 1.0 * 0.6
  });

  it('deve lidar corretamente com quebras de chunks no meio de um JSON (chunk boundaries)', async () => {
    const json1 = JSON.stringify({
      id: 'P-SPLIT',
      projetoId: 'PRJ-SPLIT',
      latitude: -23.5,
      longitude: -46.5,
      elevacao: 700,
      zoneamento: 'Misto',
      areaLoteM2: 600,
      taxaOcupacao: 0.5,
    });

    // Divide a string exatamente ao meio
    const metade1 = json1.slice(0, 35);
    const metade2 = json1.slice(35) + '\n';

    const readable = Readable.from([metade1, metade2]);
    const transformador = new TransformadorEspacialStream();

    const chunksSaida: string[] = [];
    transformador.on('data', (chunk) => {
      chunksSaida.push(chunk.toString());
    });

    await pipeline(readable, transformador);

    const saida = chunksSaida.join('').trim();
    const parsed = JSON.parse(saida) as PontoEspacialProcessado;

    expect(parsed.id).toBe('P-SPLIT');
    expect(parsed.zoneamento).toBe('Misto');
    expect(parsed.categoriaDeclividade).toBe('Suave');
    expect(transformador.registrosProcessados).toBe(1);
  });

  it('deve disparar amostragem de memória configurada', async () => {
    const ponto = JSON.stringify({
      id: 'P-1',
      projetoId: 'PRJ-1',
      latitude: -23.5,
      longitude: -46.5,
      elevacao: 600,
      zoneamento: 'Residencial',
      areaLoteM2: 300,
      taxaOcupacao: 0.5,
    }) + '\n';

    let chamadasAmostra = 0;
    const transformador = new TransformadorEspacialStream({
      amostrarMemoriaACadaNChunks: 1,
      onAmostraMemoria: (_metricas) => {
        chamadasAmostra++;
      },
    });

    const readable = Readable.from([ponto, ponto, ponto]);
    await pipeline(readable, transformador);

    expect(chamadasAmostra).toBeGreaterThan(0);
  });
});
