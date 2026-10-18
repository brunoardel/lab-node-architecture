import { describe, it, expect } from 'vitest';
import {
  toProjetoId,
  toUsuarioId,
  toMetrosQuadrados,
  toMetrosLineares,
} from '../src/domain/branded-types.js';
import { calcularPotencialConstrutivo } from '../src/domain/calculo-potencial.service.js';
import { assertNever } from '../src/domain/assert-never.js';
import {
  DadosProjetoUrbanistico,
  RegraZoneamento,
} from '../src/domain/zoneamento.types.js';

describe('Domínio Urbanístico - Branded Types', () => {
  it('permite criar ProjetoId e UsuarioId válidos', () => {
    const projId = toProjetoId('proj-123');
    const userId = toUsuarioId('user-456');

    expect(projId).toBe('proj-123');
    expect(userId).toBe('user-456');
  });

  it('lança erro ao tentar criar ProjetoId ou UsuarioId vazios', () => {
    expect(() => toProjetoId('')).toThrowError(/ProjetoId inválido/);
    expect(() => toProjetoId('   ')).toThrowError(/ProjetoId inválido/);
    expect(() => toUsuarioId('')).toThrowError(/UsuarioId inválido/);
  });

  it('permite criar MetrosQuadrados e MetrosLineares com valores positivos', () => {
    const area = toMetrosQuadrados(500);
    const recuo = toMetrosLineares(5);

    expect(area).toBe(500);
    expect(recuo).toBe(5);
  });

  it('lança erro ao tentar criar MetrosQuadrados ou MetrosLineares negativos ou zero', () => {
    expect(() => toMetrosQuadrados(0)).toThrowError(/MetrosQuadrados inválido/);
    expect(() => toMetrosQuadrados(-50)).toThrowError(/MetrosQuadrados inválido/);
    expect(() => toMetrosLineares(0)).toThrowError(/MetrosLineares inválido/);
    expect(() => toMetrosLineares(-5)).toThrowError(/MetrosLineares inválido/);
  });
});

describe('Domínio Urbanístico - Cálculo com Checagem Exaustiva (Discriminated Unions)', () => {
  it('calcula potencial construtivo para Zona Residencial', () => {
    const dados: DadosProjetoUrbanistico = {
      projetoId: toProjetoId('proj-res-1'),
      usuarioId: toUsuarioId('user-1'),
      areaTerreno: toMetrosQuadrados(1000),
      testadaPrincipal: toMetrosLineares(20),
      regraZoneamento: {
        tipo: 'residencial',
        coeficienteAproveitamento: 2.5,
        taxaOcupacaoMaxima: 0.5,
        recuoFrontalMinimo: toMetrosLineares(5),
        numeroMaximoPavimentos: 5,
      },
    };

    const resultado = calcularPotencialConstrutivo(dados);

    expect(resultado.projetoId).toBe('proj-res-1');
    expect(resultado.areaTerreno).toBe(1000);
    expect(resultado.areaConstruivelMaxima).toBe(2500); // 1000 * 2.5
    expect(resultado.areaOcupacaoMaxima).toBe(500); // 1000 * 0.5
    expect(resultado.detalhes.tipo).toBe('residencial');

    if (resultado.detalhes.tipo === 'residencial') {
      expect(resultado.detalhes.numeroMaximoPavimentos).toBe(5);
      expect(resultado.detalhes.areaEstimadaPorPavimento).toBe(500); // 2500 / 5
    }
  });

  it('calcula potencial construtivo para Zona Comercial com sobreloja', () => {
    const dados: DadosProjetoUrbanistico = {
      projetoId: toProjetoId('proj-com-1'),
      usuarioId: toUsuarioId('user-2'),
      areaTerreno: toMetrosQuadrados(2000),
      testadaPrincipal: toMetrosLineares(30),
      regraZoneamento: {
        tipo: 'comercial',
        coeficienteAproveitamento: 3.0,
        taxaOcupacaoMaxima: 0.7,
        recuoFrontalMinimo: toMetrosLineares(4),
        vagasPorCemM2: 2,
        adicionalSobreloja: true,
      },
    };

    const resultado = calcularPotencialConstrutivo(dados);

    expect(resultado.areaConstruivelMaxima).toBe(6000); // 2000 * 3.0
    expect(resultado.areaOcupacaoMaxima).toBe(1400); // 2000 * 0.7
    expect(resultado.detalhes.tipo).toBe('comercial');

    if (resultado.detalhes.tipo === 'comercial') {
      expect(resultado.detalhes.vagasObrigatorias).toBe(120); // (6000 / 100) * 2
      expect(resultado.detalhes.bonusSobrelojaAplicado).toBe(true);
    }
  });

  it('calcula potencial construtivo para Zona Industrial', () => {
    const dados: DadosProjetoUrbanistico = {
      projetoId: toProjetoId('proj-ind-1'),
      usuarioId: toUsuarioId('user-3'),
      areaTerreno: toMetrosQuadrados(5000),
      testadaPrincipal: toMetrosLineares(50),
      regraZoneamento: {
        tipo: 'industrial',
        coeficienteAproveitamento: 1.5,
        taxaOcupacaoMaxima: 0.6,
        recuoFrontalMinimo: toMetrosLineares(10),
        recuoLateralMinimo: toMetrosLineares(5),
        fatorEmissaoPoluentesMaximo: 4,
      },
    };

    const resultado = calcularPotencialConstrutivo(dados);

    expect(resultado.areaConstruivelMaxima).toBe(7500); // 5000 * 1.5
    expect(resultado.areaOcupacaoMaxima).toBe(3000); // 5000 * 0.6
    expect(resultado.detalhes.tipo).toBe('industrial');

    if (resultado.detalhes.tipo === 'industrial') {
      expect(resultado.detalhes.recuoLateralObrigatorio).toBe(5);
      expect(resultado.detalhes.fatorPoluicaoPermitido).toBe(4);
      expect(resultado.detalhes.areaPatioManobraEstimada).toBe(1000); // 5000 * 0.2
    }
  });

  it('assertNever lança exceção descritiva caso um tipo inesperado chegue em runtime', () => {
    expect(() => {
      // Simulando um bypass de tipagem em runtime
      assertNever({ tipo: 'rural' } as unknown as never);
    }).toThrowError(/Caso não tratado no switch exaustivo/);
  });
});
