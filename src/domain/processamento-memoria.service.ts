import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  capturarMetricasMemoria,
  MetricasMemoria,
  PontoEspacialInput,
  PontoEspacialProcessado,
  ResultadoProcessamentoMemoria,
  SnapshotComparativoMemoria,
  transformarPontoEspacial,
} from './dados-espaciais.types.js';
import { TransformadorEspacialStream } from './transformador-espacial.stream.js';

/**
 * Atualiza o snapshot de pico de memória comparando os valores máximos observados.
 */
function atualizarPico(picoAtual: MetricasMemoria, novaAmostra: MetricasMemoria): MetricasMemoria {
  return {
    rssBytes: Math.max(picoAtual.rssBytes, novaAmostra.rssBytes),
    rssMb: Math.max(picoAtual.rssMb, novaAmostra.rssMb),
    heapTotalBytes: Math.max(picoAtual.heapTotalBytes, novaAmostra.heapTotalBytes),
    heapTotalMb: Math.max(picoAtual.heapTotalMb, novaAmostra.heapTotalMb),
    heapUsedBytes: Math.max(picoAtual.heapUsedBytes, novaAmostra.heapUsedBytes),
    heapUsedMb: Math.max(picoAtual.heapUsedMb, novaAmostra.heapUsedMb),
    externalBytes: Math.max(picoAtual.externalBytes, novaAmostra.externalBytes),
    externalMb: Math.max(picoAtual.externalMb, novaAmostra.externalMb),
    arrayBuffersBytes: Math.max(picoAtual.arrayBuffersBytes, novaAmostra.arrayBuffersBytes),
    arrayBuffersMb: Math.max(picoAtual.arrayBuffersMb, novaAmostra.arrayBuffersMb),
  };
}

function montarSnapshot(
  inicial: MetricasMemoria,
  pico: MetricasMemoria,
  final: MetricasMemoria
): SnapshotComparativoMemoria {
  const deltaRssMb = Math.round((pico.rssMb - inicial.rssMb) * 100) / 100;
  const deltaHeapUsedMb = Math.round((pico.heapUsedMb - inicial.heapUsedMb) * 100) / 100;

  return {
    inicial,
    pico,
    final,
    deltaRssMb,
    deltaHeapUsedMb,
  };
}

/**
 * CENÁRIO A (Buffer Ingênuo):
 * Lê o arquivo massivo inteiro para um Buffer contíguo na memória RAM via `fs.promises.readFile`.
 *
 * Efeitos Colaterais no Node.js / V8:
 * 1. Aloca um Buffer em memória externa de tamanho igual ao arquivo (ex: 50MB a 100MB).
 * 2. Converte para string UTF-8 (alocando outros 50MB a 100MB na Heap do V8).
 * 3. Cria um array de centenas de milhares de strings ao executar `.split('\n')`.
 * 4. Faz parse para centenas de milhares de objetos JavaScript individuais na Heap.
 * 5. Mapeia para um segundo array de novos objetos transformados.
 * 6. Concatena todos os objetos de volta para uma string gigantesca.
 *
 * Resultado: O RSS (Resident Set Size) e o HeapUsed do processo disparam violentamente,
 * podendo causar engasgos de Garbage Collection (GC pauses) ou colapso por Out-Of-Memory (OOM).
 */
export async function processarComBuffer(
  caminhoEntrada: string,
  caminhoSaida: string
): Promise<ResultadoProcessamentoMemoria> {
  const inicioTempo = performance.now();
  const memoriaInicial = capturarMetricasMemoria();
  let memoriaPico = { ...memoriaInicial };

  if (!fs.existsSync(caminhoEntrada)) {
    throw new Error(`Arquivo de entrada não encontrado: ${caminhoEntrada}`);
  }

  const statsEntrada = fs.statSync(caminhoEntrada);
  const tamanhoArquivoBytes = statsEntrada.size;
  const tamanhoArquivoMb = Math.round((tamanhoArquivoBytes / 1024 / 1024) * 100) / 100;

  // Garante diretório de saída
  const dirSaida = path.dirname(caminhoSaida);
  if (!fs.existsSync(dirSaida)) {
    fs.mkdirSync(dirSaida, { recursive: true });
  }

  // 1. Leitura ingênua do arquivo completo em Buffer
  const bufferBruto = await fs.promises.readFile(caminhoEntrada);
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  // 2. Conversão para String na Heap do V8
  const conteudoString = bufferBruto.toString('utf-8');
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  // 3. Quebra em linhas
  const linhas = conteudoString.split('\n');
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  // 4. Parsing de cada linha para objeto JavaScript
  const registrosInput: PontoEspacialInput[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha && linha.trim().length > 0) {
      registrosInput.push(JSON.parse(linha) as PontoEspacialInput);
    }
  }
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  // 5. Transformação de todos os registros em memória
  const timestampISO = new Date().toISOString();
  const registrosProcessados: PontoEspacialProcessado[] = registrosInput.map((p) =>
    transformarPontoEspacial(p, timestampISO)
  );
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  // 6. Serialização em lote para string final
  const bufferSaida = registrosProcessados.map((p) => JSON.stringify(p)).join('\n') + '\n';
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  // 7. Gravação em disco
  await fs.promises.writeFile(caminhoSaida, bufferSaida, 'utf-8');
  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());

  const fimTempo = performance.now();
  const tempoProcessamentoMs = Math.round((fimTempo - inicioTempo) * 100) / 100;
  const taxaTransferenciaMbPorSegundo =
    tempoProcessamentoMs > 0
      ? Math.round((tamanhoArquivoMb / (tempoProcessamentoMs / 1000)) * 100) / 100
      : 0;

  const memoriaFinal = capturarMetricasMemoria();
  const snapshot = montarSnapshot(memoriaInicial, memoriaPico, memoriaFinal);

  return {
    cenario: 'buffer',
    descricao: 'Cenário A: Leitura e processamento ingênuo via Buffer (fs.readFile)',
    arquivoEntrada: caminhoEntrada,
    arquivoSaida: caminhoSaida,
    tamanhoArquivoBytes,
    tamanhoArquivoMb,
    totalRegistrosProcessados: registrosProcessados.length,
    tempoProcessamentoMs,
    taxaTransferenciaMbPorSegundo,
    memoria: snapshot,
    concluidoEm: new Date().toISOString(),
  };
}

/**
 * CENÁRIO B (Streams e Backpressure):
 * Processamento via `stream.pipeline` com `Transform` stream em chunks de 64KB (`64 * 1024`).
 *
 * Princípios de Baixo Consumo de RAM:
 * 1. O arquivo nunca é carregado por inteiro na memória.
 * 2. A cada instante, apenas ~64KB de dados estão trafegando na memória entre o ReadStream e o WriteStream.
 * 3. O coletor de lixo (GC) do Node.js recicla instantaneamente os pequenos objetos na geração jovem (Scavenge).
 * 4. O mecanismo de Backpressure garante que se a gravação em disco for mais lenta que a leitura,
 *    a leitura é pausada automaticamente, mantendo o consumo de memória rigorosamente estável e linear.
 */
export async function processarComStream(
  caminhoEntrada: string,
  caminhoSaida: string,
  opcoes: { highWaterMark?: number } = {}
): Promise<ResultadoProcessamentoMemoria> {
  const inicioTempo = performance.now();
  const memoriaInicial = capturarMetricasMemoria();
  let memoriaPico = { ...memoriaInicial };

  if (!fs.existsSync(caminhoEntrada)) {
    throw new Error(`Arquivo de entrada não encontrado: ${caminhoEntrada}`);
  }

  const statsEntrada = fs.statSync(caminhoEntrada);
  const tamanhoArquivoBytes = statsEntrada.size;
  const tamanhoArquivoMb = Math.round((tamanhoArquivoBytes / 1024 / 1024) * 100) / 100;

  const dirSaida = path.dirname(caminhoSaida);
  if (!fs.existsSync(dirSaida)) {
    fs.mkdirSync(dirSaida, { recursive: true });
  }

  const highWaterMark = opcoes.highWaterMark ?? 64 * 1024; // 64KB conforme especificação RF03

  const readStream = fs.createReadStream(caminhoEntrada, {
    highWaterMark,
    encoding: 'utf-8',
  });

  const transformStream = new TransformadorEspacialStream({
    highWaterMark,
    amostrarMemoriaACadaNChunks: 5,
    onAmostraMemoria: (amostra) => {
      memoriaPico = atualizarPico(memoriaPico, amostra);
    },
  });

  const writeStream = fs.createWriteStream(caminhoSaida, {
    highWaterMark,
    encoding: 'utf-8',
    flags: 'w',
  });

  // Amostragem inicial e periódica durante a pipeline
  const intervaloMonitoramento = setInterval(() => {
    memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());
  }, 10);

  try {
    // Executa a pipeline nativa segura do Node.js com encerramento de streams em caso de erro
    await pipeline(readStream, transformStream, writeStream);
  } finally {
    clearInterval(intervaloMonitoramento);
  }

  memoriaPico = atualizarPico(memoriaPico, capturarMetricasMemoria());
  const fimTempo = performance.now();
  const tempoProcessamentoMs = Math.round((fimTempo - inicioTempo) * 100) / 100;
  const taxaTransferenciaMbPorSegundo =
    tempoProcessamentoMs > 0
      ? Math.round((tamanhoArquivoMb / (tempoProcessamentoMs / 1000)) * 100) / 100
      : 0;

  const memoriaFinal = capturarMetricasMemoria();
  const snapshot = montarSnapshot(memoriaInicial, memoriaPico, memoriaFinal);

  return {
    cenario: 'stream',
    descricao: 'Cenário B: Processamento por Streams e Backpressure (stream.pipeline com Transform 64KB)',
    arquivoEntrada: caminhoEntrada,
    arquivoSaida: caminhoSaida,
    tamanhoArquivoBytes,
    tamanhoArquivoMb,
    totalRegistrosProcessados: transformStream.registrosProcessados,
    tempoProcessamentoMs,
    taxaTransferenciaMbPorSegundo,
    memoria: snapshot,
    concluidoEm: new Date().toISOString(),
  };
}
