import { Transform, TransformCallback, TransformOptions } from 'node:stream';
import {
  capturarMetricasMemoria,
  MetricasMemoria,
  PontoEspacialInput,
  transformarPontoEspacial,
} from './dados-espaciais.types.js';

export interface TransformadorEspacialOptions extends TransformOptions {
  onAmostraMemoria?: (metricas: MetricasMemoria) => void;
  amostrarMemoriaACadaNChunks?: number;
}

/**
 * Transform Stream responsável pelo parsing, enriquecimento e serialização
 * de dados espaciais linha a linha (NDJSON) em chunks de 64KB.
 *
 * Princípios de Engenharia de Streams:
 * 1. Chunks de 64KB (highWaterMark: 64 * 1024):
 *    Processa os bytes à medida que chegam da stream de leitura, sem carregar o arquivo inteiro na memória.
 * 2. Manuseio de Linhas Fracionadas (Chunk Boundary Handling):
 *    Linhas NDJSON que atravessam a borda entre dois chunks de 64KB são acumuladas em um pequeno
 *    buffer residual (`bufferSobraLinha`) e processadas assim que o próximo chunk chega.
 * 3. Backpressure Automático:
 *    Se o destino (ex: WriteStream em disco ou socket de rede) estiver lento, `this.push()` sinaliza
 *    para pausar a leitura do upstream, impedindo o acúmulo de dados na memória RAM.
 */
export class TransformadorEspacialStream extends Transform {
  private bufferSobraLinha = '';
  private totalRegistrosProcessados = 0;
  private totalChunksRecebidos = 0;
  private readonly timestampExecucao: string;
  private readonly onAmostraMemoria?: (metricas: MetricasMemoria) => void;
  private readonly amostrarMemoriaACadaNChunks: number;

  constructor(options: TransformadorEspacialOptions = {}) {
    super({
      // Default de 64KB conforme especificação do RF03 do PRD
      highWaterMark: options.highWaterMark ?? 64 * 1024,
      ...options,
    });

    this.timestampExecucao = new Date().toISOString();
    this.onAmostraMemoria = options.onAmostraMemoria;
    this.amostrarMemoriaACadaNChunks = options.amostrarMemoriaACadaNChunks ?? 10;
  }

  get registrosProcessados(): number {
    return this.totalRegistrosProcessados;
  }

  get chunksProcessados(): number {
    return this.totalChunksRecebidos;
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    try {
      this.totalChunksRecebidos++;

      // Converte o chunk recebido para string e concatena com a sobra da linha anterior
      const chunkStr = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
      const conteudoCompleto = this.bufferSobraLinha + chunkStr;

      // Divide em linhas pelo delimitador \n
      const linhas = conteudoCompleto.split('\n');

      // O último elemento é a sobra incompleta (ou string vazia se terminou com \n)
      this.bufferSobraLinha = linhas.pop() ?? '';

      // Processa e empurra cada linha completa downstream
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!linha || linha.trim().length === 0) {
          continue;
        }

        const pontoInput = JSON.parse(linha) as PontoEspacialInput;
        const pontoProcessado = transformarPontoEspacial(pontoInput, this.timestampExecucao);
        const linhaSaida = JSON.stringify(pontoProcessado) + '\n';

        this.push(linhaSaida);
        this.totalRegistrosProcessados++;
      }

      // Amostra métricas de memória periodicamente para demonstrar estabilidade
      if (
        this.onAmostraMemoria &&
        this.totalChunksRecebidos % this.amostrarMemoriaACadaNChunks === 0
      ) {
        this.onAmostraMemoria(capturarMetricasMemoria());
      }

      callback();
    } catch (erro) {
      callback(erro instanceof Error ? erro : new Error(String(erro)));
    }
  }

  override _flush(callback: TransformCallback): void {
    try {
      // Processa a última linha caso o arquivo não termine com quebra de linha
      if (this.bufferSobraLinha.trim().length > 0) {
        const pontoInput = JSON.parse(this.bufferSobraLinha) as PontoEspacialInput;
        const pontoProcessado = transformarPontoEspacial(pontoInput, this.timestampExecucao);
        const linhaSaida = JSON.stringify(pontoProcessado) + '\n';

        this.push(linhaSaida);
        this.totalRegistrosProcessados++;
        this.bufferSobraLinha = '';
      }

      if (this.onAmostraMemoria) {
        this.onAmostraMemoria(capturarMetricasMemoria());
      }

      callback();
    } catch (erro) {
      callback(erro instanceof Error ? erro : new Error(String(erro)));
    }
  }
}
