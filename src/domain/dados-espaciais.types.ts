/**
 * Tipos e interfaces de domínio para o processamento de dados espaciais massivos.
 * Contexto da ArqLab: Ingestão, análise topográfica e cálculo de risco geotécnico
 * para centenas de milhares de coordenadas de parcelamento de solo urbano.
 */

export type CategoriaDeclividade = 'Plano' | 'Suave' | 'Ondulado' | 'Escarpado';
export type RiscoGeotecnico = 'Baixo' | 'Medio' | 'Alto';

export interface PontoEspacialInput {
  id: string;
  projetoId: string;
  latitude: number;
  longitude: number;
  elevacao: number;
  zoneamento: 'Residencial' | 'Comercial' | 'Industrial' | 'Misto';
  areaLoteM2: number;
  taxaOcupacao: number;
}

export interface PontoEspacialProcessado extends PontoEspacialInput {
  categoriaDeclividade: CategoriaDeclividade;
  riscoGeotecnico: RiscoGeotecnico;
  potencialConstrutivoMaxM2: number;
  timestampProcessamento: string;
}

export interface MetricasMemoria {
  rssBytes: number;
  rssMb: number;
  heapTotalBytes: number;
  heapTotalMb: number;
  heapUsedBytes: number;
  heapUsedMb: number;
  externalBytes: number;
  externalMb: number;
  arrayBuffersBytes: number;
  arrayBuffersMb: number;
}

export interface SnapshotComparativoMemoria {
  inicial: MetricasMemoria;
  pico: MetricasMemoria;
  final: MetricasMemoria;
  deltaRssMb: number;
  deltaHeapUsedMb: number;
}

export interface ResultadoProcessamentoMemoria {
  cenario: 'buffer' | 'stream';
  descricao: string;
  arquivoEntrada: string;
  arquivoSaida: string;
  tamanhoArquivoBytes: number;
  tamanhoArquivoMb: number;
  totalRegistrosProcessados: number;
  tempoProcessamentoMs: number;
  taxaTransferenciaMbPorSegundo: number;
  memoria: SnapshotComparativoMemoria;
  concluidoEm: string;
}

/**
 * Função pura de transformação e enriquecimento de dados espaciais.
 * Executada tanto pelo modelo de Buffer quanto pelo Transform stream.
 */
export function transformarPontoEspacial(
  ponto: PontoEspacialInput,
  timestampISO: string = new Date().toISOString()
): PontoEspacialProcessado {
  let categoriaDeclividade: CategoriaDeclividade = 'Plano';
  let riscoGeotecnico: RiscoGeotecnico = 'Baixo';

  if (ponto.elevacao > 1050) {
    categoriaDeclividade = 'Escarpado';
    riscoGeotecnico = 'Alto';
  } else if (ponto.elevacao > 850) {
    categoriaDeclividade = 'Ondulado';
    riscoGeotecnico = 'Medio';
  } else if (ponto.elevacao > 650) {
    categoriaDeclividade = 'Suave';
    riscoGeotecnico = 'Baixo';
  } else {
    categoriaDeclividade = 'Plano';
    riscoGeotecnico = 'Baixo';
  }

  // Fatores de aproveitamento urbanístico
  let coeficienteAproveitamento = 1.5;
  switch (ponto.zoneamento) {
    case 'Residencial':
      coeficienteAproveitamento = 2.0;
      break;
    case 'Comercial':
      coeficienteAproveitamento = 3.5;
      break;
    case 'Industrial':
      coeficienteAproveitamento = 1.0;
      break;
    case 'Misto':
      coeficienteAproveitamento = 2.8;
      break;
  }

  // Se o terreno for escarpado, reduz o potencial construtivo para mitigação de risco
  const fatorRisco = riscoGeotecnico === 'Alto' ? 0.6 : riscoGeotecnico === 'Medio' ? 0.85 : 1.0;
  const potencialBruto = ponto.areaLoteM2 * coeficienteAproveitamento * fatorRisco;
  const potencialConstrutivoMaxM2 = Math.round(potencialBruto * 100) / 100;

  return {
    ...ponto,
    categoriaDeclividade,
    riscoGeotecnico,
    potencialConstrutivoMaxM2,
    timestampProcessamento: timestampISO,
  };
}

/**
 * Captura o snapshot atual das métricas de memória do processo Node.js.
 */
export function capturarMetricasMemoria(): MetricasMemoria {
  const mem = process.memoryUsage();
  const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

  return {
    rssBytes: mem.rss,
    rssMb: toMb(mem.rss),
    heapTotalBytes: mem.heapTotal,
    heapTotalMb: toMb(mem.heapTotal),
    heapUsedBytes: mem.heapUsed,
    heapUsedMb: toMb(mem.heapUsed),
    externalBytes: mem.external,
    externalMb: toMb(mem.external),
    arrayBuffersBytes: mem.arrayBuffers,
    arrayBuffersMb: toMb(mem.arrayBuffers),
  };
}
