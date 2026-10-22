import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { gerarArquivoEspacial } from '../src/domain/gerador-dados-espaciais.js';
import {
  processarComBuffer,
  processarComStream,
} from '../src/domain/processamento-memoria.service.js';

describe('Serviço de Processamento de Memória (Buffer vs. Streams)', () => {
  const dirTeste = path.resolve(process.cwd(), 'tmp', 'test-memoria-service');
  const arquivoEntrada = path.join(dirTeste, 'entrada-teste.ndjson');
  const arquivoSaidaBuffer = path.join(dirTeste, 'saida-buffer.ndjson');
  const arquivoSaidaStream = path.join(dirTeste, 'saida-stream.ndjson');

  beforeAll(async () => {
    if (!fs.existsSync(dirTeste)) {
      fs.mkdirSync(dirTeste, { recursive: true });
    }
    // Gera arquivo de teste de ~500 KB para execução rápida na suíte
    await gerarArquivoEspacial({
      caminhoArquivo: arquivoEntrada,
      tamanhoAlvoBytes: 500 * 1024,
    });
  });

  afterAll(() => {
    if (fs.existsSync(dirTeste)) {
      fs.rmSync(dirTeste, { recursive: true, force: true });
    }
  });

  it('deve processar o arquivo com Buffer e registrar métricas de pico de memória', async () => {
    const resultado = await processarComBuffer(arquivoEntrada, arquivoSaidaBuffer);

    expect(resultado.cenario).toBe('buffer');
    expect(resultado.totalRegistrosProcessados).toBeGreaterThan(0);
    expect(resultado.tempoProcessamentoMs).toBeGreaterThan(0);
    expect(fs.existsSync(arquivoSaidaBuffer)).toBe(true);

    // Validação das métricas de memória
    expect(resultado.memoria.inicial.rssMb).toBeGreaterThan(0);
    expect(resultado.memoria.pico.rssMb).toBeGreaterThanOrEqual(resultado.memoria.inicial.rssMb);
    expect(resultado.memoria.pico.heapUsedMb).toBeGreaterThan(0);
  });

  it('deve processar o arquivo com Stream e produzir os mesmos registros com estabilidade de memória', async () => {
    const resultado = await processarComStream(arquivoEntrada, arquivoSaidaStream, {
      highWaterMark: 16 * 1024,
    });

    expect(resultado.cenario).toBe('stream');
    expect(resultado.totalRegistrosProcessados).toBeGreaterThan(0);
    expect(resultado.tempoProcessamentoMs).toBeGreaterThan(0);
    expect(fs.existsSync(arquivoSaidaStream)).toBe(true);

    // Validação das métricas de memória
    expect(resultado.memoria.inicial.rssMb).toBeGreaterThan(0);
    expect(resultado.memoria.pico.rssMb).toBeGreaterThan(0);

    // Compara contagem de registros entre Buffer e Stream
    const conteudoBuffer = fs.readFileSync(arquivoSaidaBuffer, 'utf-8').trim().split('\n');
    const conteudoStream = fs.readFileSync(arquivoSaidaStream, 'utf-8').trim().split('\n');

    expect(conteudoStream.length).toBe(conteudoBuffer.length);

    // Compara o primeiro e o último registro (exceto timestamp)
    const primeiroBuffer = JSON.parse(conteudoBuffer[0]!);
    const primeiroStream = JSON.parse(conteudoStream[0]!);
    expect(primeiroStream.id).toBe(primeiroBuffer.id);
    expect(primeiroStream.categoriaDeclividade).toBe(primeiroBuffer.categoriaDeclividade);
    expect(primeiroStream.riscoGeotecnico).toBe(primeiroBuffer.riscoGeotecnico);
    expect(primeiroStream.potencialConstrutivoMaxM2).toBe(primeiroBuffer.potencialConstrutivoMaxM2);

    const ultimoIndex = conteudoBuffer.length - 1;
    const ultimoBuffer = JSON.parse(conteudoBuffer[ultimoIndex]!);
    const ultimoStream = JSON.parse(conteudoStream[ultimoIndex]!);
    expect(ultimoStream.id).toBe(ultimoBuffer.id);
    expect(ultimoStream.categoriaDeclividade).toBe(ultimoBuffer.categoriaDeclividade);
    expect(ultimoStream.riscoGeotecnico).toBe(ultimoBuffer.riscoGeotecnico);
  });

  it('deve lançar erro se o arquivo de entrada não existir', async () => {
    const arquivoInexistente = path.join(dirTeste, 'inexistente.ndjson');

    await expect(
      processarComBuffer(arquivoInexistente, arquivoSaidaBuffer)
    ).rejects.toThrow('Arquivo de entrada não encontrado');

    await expect(
      processarComStream(arquivoInexistente, arquivoSaidaStream)
    ).rejects.toThrow('Arquivo de entrada não encontrado');
  });
});
