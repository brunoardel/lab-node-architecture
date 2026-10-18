import {
  MetrosLineares,
  MetrosQuadrados,
  ProjetoId,
  UsuarioId,
} from './branded-types.js';

export interface RegraResidencial {
  tipo: 'residencial';
  coeficienteAproveitamento: number;
  taxaOcupacaoMaxima: number;
  recuoFrontalMinimo: MetrosLineares;
  numeroMaximoPavimentos: number;
}

export interface RegraComercial {
  tipo: 'comercial';
  coeficienteAproveitamento: number;
  taxaOcupacaoMaxima: number;
  recuoFrontalMinimo: MetrosLineares;
  vagasPorCemM2: number;
  adicionalSobreloja?: boolean;
}

export interface RegraIndustrial {
  tipo: 'industrial';
  coeficienteAproveitamento: number;
  taxaOcupacaoMaxima: number;
  recuoFrontalMinimo: MetrosLineares;
  recuoLateralMinimo: MetrosLineares;
  fatorEmissaoPoluentesMaximo: number;
}

export type RegraZoneamento =
  | RegraResidencial
  | RegraComercial
  | RegraIndustrial;

// Para testar a checagem exaustiva com assertNever, descomente a linha abaixo e a interface:
// export interface RegraRural { tipo: 'rural'; areaMinimaHectares: number; }
// export type RegraZoneamento = RegraResidencial | RegraComercial | RegraIndustrial | RegraRural;

export interface DadosProjetoUrbanistico {
  projetoId: ProjetoId;
  usuarioId: UsuarioId;
  areaTerreno: MetrosQuadrados;
  testadaPrincipal: MetrosLineares;
  regraZoneamento: RegraZoneamento;
}

export interface DetalhesCalculoResidencial {
  tipo: 'residencial';
  numeroMaximoPavimentos: number;
  areaEstimadaPorPavimento: MetrosQuadrados;
}

export interface DetalhesCalculoComercial {
  tipo: 'comercial';
  vagasObrigatorias: number;
  bonusSobrelojaAplicado: boolean;
}

export interface DetalhesCalculoIndustrial {
  tipo: 'industrial';
  recuoLateralObrigatorio: MetrosLineares;
  fatorPoluicaoPermitido: number;
  areaPatioManobraEstimada: MetrosQuadrados;
}

export type DetalhesCalculo =
  | DetalhesCalculoResidencial
  | DetalhesCalculoComercial
  | DetalhesCalculoIndustrial;

export interface ResultadoCalculoPotencial {
  projetoId: ProjetoId;
  usuarioId: UsuarioId;
  areaTerreno: MetrosQuadrados;
  areaConstruivelMaxima: MetrosQuadrados;
  areaOcupacaoMaxima: MetrosQuadrados;
  detalhes: DetalhesCalculo;
}
