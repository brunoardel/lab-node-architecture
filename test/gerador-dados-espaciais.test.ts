import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  garantirArquivoMassivoExiste,
  gerarArquivoEspacial,
} from '../src/domain/gerador-dados-espaciais.js';

describe('Gerador de Dados Espaciais Massivos', () => {
  const dirTeste = path.resolve(process.cwd(), 'tmp', 'test-gerador');

  afterEach(() => {
    if (fs.existsSync(dirTeste)) {
      fs.rmSync(dirTeste, { recursive: true, force: true });
    }
  });

  it('deve gerar arquivo NDJSON com tamanho alvo e linhas sintaticamente válidas', async () => {
    const caminhoArquivo = path.join(dirTeste, 'dados-teste.ndjson');
    const tamanhoAlvo = 150 * 1024; // 150 KB

    const resultado = await gerarArquivoEspacial({
      caminhoArquivo,
      tamanhoAlvoBytes: tamanhoAlvo,
      batchSize: 16 * 1024,
    });

    expect(fs.existsSync(caminhoArquivo)).toBe(true);
    expect(resultado.totalBytes).toBeGreaterThanOrEqual(tamanhoAlvo);
    expect(resultado.totalRegistros).toBeGreaterThan(0);
    expect(resultado.tempoMs).toBeGreaterThan(0);

    // Valida integridade do NDJSON
    const conteudo = fs.readFileSync(caminhoArquivo, 'utf-8');
    const linhas = conteudo.trim().split('\n');

    expect(linhas.length).toBe(resultado.totalRegistros);

    const primeiroRegistro = JSON.parse(linhas[0]!);
    expect(primeiroRegistro).toHaveProperty('id');
    expect(primeiroRegistro).toHaveProperty('projetoId');
    expect(primeiroRegistro).toHaveProperty('latitude');
    expect(primeiroRegistro).toHaveProperty('longitude');
    expect(primeiroRegistro).toHaveProperty('elevacao');
    expect(primeiroRegistro).toHaveProperty('zoneamento');
    expect(primeiroRegistro).toHaveProperty('areaLoteM2');
    expect(primeiroRegistro).toHaveProperty('taxaOcupacao');

    expect(typeof primeiroRegistro.latitude).toBe('number');
    expect(typeof primeiroRegistro.longitude).toBe('number');
    expect(typeof primeiroRegistro.elevacao).toBe('number');
  });

  it('deve reutilizar arquivo existente se ele já atingir a meta de tamanho', async () => {
    const caminhoArquivo = path.join(dirTeste, 'dados-reutilizaveis.ndjson');
    const tamanhoAlvo = 100 * 1024;

    // Primeira chamada: cria o arquivo
    const primeira = await garantirArquivoMassivoExiste(caminhoArquivo, tamanhoAlvo);
    expect(primeira.criado).toBe(true);
    expect(primeira.totalBytes).toBeGreaterThanOrEqual(tamanhoAlvo);

    // Segunda chamada: reutiliza o arquivo existente
    const segunda = await garantirArquivoMassivoExiste(caminhoArquivo, tamanhoAlvo);
    expect(segunda.criado).toBe(false);
    expect(segunda.totalBytes).toBe(primeira.totalBytes);
  });
});
