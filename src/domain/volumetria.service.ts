import { isMainThread, threadId } from 'node:worker_threads';
import { ParametrosVolumetria, ResultadoVolumetria } from './volumetria.types.js';

/**
 * Executa o cálculo pesado de volumetria geométrica e terraplenagem de terreno.
 *
 * Esta função é deliberadamente INTENSIVA EM CPU (CPU-bound):
 * - Discretiza uma superfície tridimensional topográfica não-linear (grid N x N).
 * - Calcula volumes parciais de prisma truncado para escavação (corte) e preenchimento (aterro).
 * - Executa séries de expansão polinomial e trigonométrica para simular balanceamento de massa.
 *
 * Por padrão, o laço matemático consome entre 2 e 3 segundos de CPU 100% contínua,
 * demonstrando o congelamento do Event Loop quando chamado na thread principal.
 */
export function executarCalculoVolumetria(params: ParametrosVolumetria = {}): ResultadoVolumetria {
  const inicio = performance.now();

  const grid = Math.max(10, params.dimensaoGrid ?? 500);
  const cotaProjeto = params.cotaProjeto ?? 25.0;
  const fatorEmpolamento = params.fatorEmpolamento ?? 1.25;
  const iteracoes = params.iteracoes ?? 150_000_000;

  let totalCorte = 0;
  let totalAterro = 0;
  let somaCotas = 0;
  let pontosContados = 0;

  // 1. Simulação topográfica baseada no grid
  const delta = 1.0; // resolução espacial de 1 metro
  const areaCelula = delta * delta;

  for (let x = 0; x < grid; x++) {
    for (let y = 0; y < grid; y++) {
      // Superfície ondulada com múltiplos harmônicos
      const cotaTerreno =
        20.0 +
        8.0 * Math.sin(x * 0.03) * Math.cos(y * 0.03) +
        3.0 * Math.sin((x * x + y * y) * 0.0001);

      somaCotas += cotaTerreno;
      pontosContados++;

      const diferenca = cotaTerreno - cotaProjeto;
      if (diferenca > 0) {
        totalCorte += diferenca * areaCelula;
      } else {
        totalAterro += Math.abs(diferenca) * areaCelula;
      }
    }
  }

  // 2. Carga intensiva de CPU: cálculo de aproximações de estabilidade de talude
  // Simula o refinamento por elementos finitos e amortecimento numérico
  let acumuladorCpu = 0;
  for (let i = 0; i < iteracoes; i++) {
    // Operações de ponto flutuante contínuas
    acumuladorCpu += Math.sin(i * 0.00001) * Math.cos(i * 0.00002) + Math.sqrt(i % 1000 + 1);
  }

  // Balanço compensado: Corte - (Aterro corrigido pelo fator de empolamento)
  // O acumuladorCpu é somado com peso residual minúsculo para impedir que o compilador JIT V8
  // realize Dead Code Elimination (otimização que descartaria o laço de CPU)
  const ajusteResidual = (acumuladorCpu % 100) * 0.000001;
  const cotaMedia = pontosContados > 0 ? somaCotas / pontosContados : cotaProjeto;
  const volumeCorteFinal = Math.round((totalCorte + ajusteResidual) * 100) / 100;
  const volumeAterroFinal = Math.round(totalAterro * 100) / 100;
  const volumeLiquidoFinal = Math.round((volumeCorteFinal - volumeAterroFinal * fatorEmpolamento) * 100) / 100;

  const fim = performance.now();
  const tempoProcessamentoMs = Math.round((fim - inicio) * 100) / 100;

  return {
    volumeCorteM3: volumeCorteFinal,
    volumeAterroM3: volumeAterroFinal,
    volumeLiquidoM3: volumeLiquidoFinal,
    cotaMediaTerrenoM: Math.round(cotaMedia * 100) / 100,
    pontosProcessados: pontosContados,
    tempoProcessamentoMs,
    executadoEm: isMainThread ? 'main-thread' : 'worker-thread',
    threadId,
    concluidoEm: new Date().toISOString(),
  };
}
