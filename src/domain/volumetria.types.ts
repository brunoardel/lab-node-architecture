/**
 * Tipos e contratos de domínio para o cálculo de volumetria e terraplenagem.
 * Simula a análise geométrica topográfica de cortes e aterros para implantação de obras.
 */

export interface ParametrosVolumetria {
  /**
   * Dimensão da grade topográfica (grid N x N de células).
   * @default 600
   */
  dimensaoGrid?: number;

  /**
   * Cota do platô planejado em metros (nível de referência).
   * @default 25.0
   */
  cotaProjeto?: number;

  /**
   * Taxa de empolamento / expansão do solo ao ser escavado.
   * @default 1.25
   */
  fatorEmpolamento?: number;

  /**
   * Quantidade de iterações do laço matemático de convergência de relevo.
   * Usado para calibrar o consumo de CPU entre 2 e 3 segundos.
   * @default 150_000_000
   */
  iteracoes?: number;
}

export interface ResultadoVolumetria {
  /** Volume total escavado de terra (m³) */
  volumeCorteM3: number;
  /** Volume total necessário para preenchimento de aterro (m³) */
  volumeAterroM3: number;
  /** Balanço volumétrico compensado (Corte - Aterro * Empolamento) */
  volumeLiquidoM3: number;
  /** Cota média natural original do terreno em metros */
  cotaMediaTerrenoM: number;
  /** Quantidade total de pontos e células processadas */
  pontosProcessados: number;
  /** Tempo exato gasto em CPU em milissegundos */
  tempoProcessamentoMs: number;
  /** Identificação se a execução ocorreu na thread principal ou em worker secundário */
  executadoEm: 'main-thread' | 'worker-thread';
  /** ID da thread no Node.js (0 para thread principal) */
  threadId: number;
  /** Timestamp de finalização do cálculo */
  concluidoEm: string;
}

export interface WorkerVolumetriaMessageRequest {
  id: string;
  params: ParametrosVolumetria;
}

export interface WorkerVolumetriaMessageResponse {
  id: string;
  success: boolean;
  data?: ResultadoVolumetria;
  error?: string;
}
