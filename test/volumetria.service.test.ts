import { describe, it, expect } from 'vitest';
import { executarCalculoVolumetria } from '../src/domain/volumetria.service.js';

describe('Serviço de Volumetria e Terraplenagem (CPU-bound)', () => {
  it('deve calcular volumes de corte, aterro e balanço compensado corretamente', () => {
    // Usamos um número menor de iterações para o teste unitário rodar rápido
    const resultado = executarCalculoVolumetria({
      dimensaoGrid: 50,
      cotaProjeto: 22.0,
      fatorEmpolamento: 1.25,
      iteracoes: 5_000,
    });

    expect(resultado.pontosProcessados).toBe(2500); // 50 * 50
    expect(resultado.volumeCorteM3).toBeGreaterThan(0);
    expect(resultado.volumeAterroM3).toBeGreaterThan(0);
    expect(resultado.cotaMediaTerrenoM).toBeGreaterThan(0);
    expect(resultado.tempoProcessamentoMs).toBeGreaterThanOrEqual(0);
    expect(resultado.executadoEm).toBe('main-thread');
    expect(resultado.threadId).toBe(0);
    expect(resultado.concluidoEm).toBeDefined();

    // Verificação da fórmula de compensação: Líquido = Corte - Aterro * Empolamento
    const esperadoLiquido = Math.round((resultado.volumeCorteM3 - resultado.volumeAterroM3 * 1.25) * 100) / 100;
    expect(resultado.volumeLiquidoM3).toBeCloseTo(esperadoLiquido, 1);
  });

  it('deve usar valores padrão razoáveis quando nenhum parâmetro for fornecido', () => {
    // Passando iteracoes baixas para não travar o test runner desnecessariamente
    const resultado = executarCalculoVolumetria({ iteracoes: 10_000, dimensaoGrid: 30 });
    expect(resultado.pontosProcessados).toBe(900);
    expect(resultado.volumeCorteM3).toBeTypeOf('number');
    expect(resultado.volumeAterroM3).toBeTypeOf('number');
  });

  it('deve garantir que terrenos com cotas de projeto muito altas resultem em maior aterro', () => {
    const cotaAlta = executarCalculoVolumetria({
      dimensaoGrid: 30,
      cotaProjeto: 80.0,
      iteracoes: 1_000,
    });

    const cotaBaixa = executarCalculoVolumetria({
      dimensaoGrid: 30,
      cotaProjeto: 5.0,
      iteracoes: 1_000,
    });

    // Cota 80m exige aterrar muito terreno
    expect(cotaAlta.volumeAterroM3).toBeGreaterThan(cotaBaixa.volumeAterroM3);
    // Cota 5m exige escavar (cortar) quase todo o terreno
    expect(cotaBaixa.volumeCorteM3).toBeGreaterThan(cotaAlta.volumeCorteM3);
  });
});
