import { assertNever } from './assert-never.js';
import { toMetrosQuadrados } from './branded-types.js';
import {
  DadosProjetoUrbanistico,
  DetalhesCalculo,
  ResultadoCalculoPotencial,
} from './zoneamento.types.js';

export function calcularPotencialConstrutivo(
  dados: DadosProjetoUrbanistico
): ResultadoCalculoPotencial {
  const { areaTerreno, regraZoneamento } = dados;

  // Área construível máxima baseada no coeficiente de aproveitamento
  const areaConstruivelMaxima = toMetrosQuadrados(
    Number((areaTerreno * regraZoneamento.coeficienteAproveitamento).toFixed(2))
  );

  // Área de ocupação máxima na projeção horizontal baseada na taxa de ocupação
  const areaOcupacaoMaxima = toMetrosQuadrados(
    Number((areaTerreno * regraZoneamento.taxaOcupacaoMaxima).toFixed(2))
  );

  let detalhes: DetalhesCalculo;

  switch (regraZoneamento.tipo) {
    case 'residencial': {
      const areaEstimadaPorPavimento = toMetrosQuadrados(
        Number(
          (
            areaConstruivelMaxima / regraZoneamento.numeroMaximoPavimentos
          ).toFixed(2)
        )
      );

      detalhes = {
        tipo: 'residencial',
        numeroMaximoPavimentos: regraZoneamento.numeroMaximoPavimentos,
        areaEstimadaPorPavimento,
      };
      break;
    }

    case 'comercial': {
      // Vagas obrigatórias calculadas por cada 100m² construídos
      const vagasObrigatorias = Math.ceil(
        (areaConstruivelMaxima / 100) * regraZoneamento.vagasPorCemM2
      );

      detalhes = {
        tipo: 'comercial',
        vagasObrigatorias,
        bonusSobrelojaAplicado: Boolean(regraZoneamento.adicionalSobreloja),
      };
      break;
    }

    case 'industrial': {
      // Estimativa de pátio de manobras obrigatório proporcional ao terreno
      const areaPatioManobraEstimada = toMetrosQuadrados(
        Number((areaTerreno * 0.2).toFixed(2))
      );

      detalhes = {
        tipo: 'industrial',
        recuoLateralObrigatorio: regraZoneamento.recuoLateralMinimo,
        fatorPoluicaoPermitido: regraZoneamento.fatorEmissaoPoluentesMaximo,
        areaPatioManobraEstimada,
      };
      break;
    }

    default:
      // Verificação exaustiva garantida pelo compilador TypeScript
      return assertNever(regraZoneamento);
  }

  return {
    projetoId: dados.projetoId,
    usuarioId: dados.usuarioId,
    areaTerreno: dados.areaTerreno,
    areaConstruivelMaxima,
    areaOcupacaoMaxima,
    detalhes,
  };
}
