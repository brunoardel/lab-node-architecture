import { z } from 'zod';
import {
  toMetrosLineares,
  toMetrosQuadrados,
  toProjetoId,
  toUsuarioId,
} from '../domain/branded-types.js';
import { DadosProjetoUrbanistico } from '../domain/zoneamento.types.js';

export const regraResidencialSchema = z.object({
  tipo: z.literal('residencial'),
  coeficienteAproveitamento: z
    .number({ required_error: 'coeficienteAproveitamento é obrigatório' })
    .positive('coeficienteAproveitamento deve ser maior que zero'),
  taxaOcupacaoMaxima: z
    .number({ required_error: 'taxaOcupacaoMaxima é obrigatória' })
    .min(0.01, 'taxaOcupacaoMaxima mínima é 0.01')
    .max(1.0, 'taxaOcupacaoMaxima máxima é 1.0 (100%)'),
  recuoFrontalMinimo: z
    .number({ required_error: 'recuoFrontalMinimo é obrigatório' })
    .positive('recuoFrontalMinimo deve ser maior que zero'),
  numeroMaximoPavimentos: z
    .number({ required_error: 'numeroMaximoPavimentos é obrigatório' })
    .int('numeroMaximoPavimentos deve ser inteiro')
    .positive('numeroMaximoPavimentos deve ser maior que zero'),
});

export const regraComercialSchema = z.object({
  tipo: z.literal('comercial'),
  coeficienteAproveitamento: z
    .number({ required_error: 'coeficienteAproveitamento é obrigatório' })
    .positive('coeficienteAproveitamento deve ser maior que zero'),
  taxaOcupacaoMaxima: z
    .number({ required_error: 'taxaOcupacaoMaxima é obrigatória' })
    .min(0.01, 'taxaOcupacaoMaxima mínima é 0.01')
    .max(1.0, 'taxaOcupacaoMaxima máxima é 1.0 (100%)'),
  recuoFrontalMinimo: z
    .number({ required_error: 'recuoFrontalMinimo é obrigatório' })
    .positive('recuoFrontalMinimo deve ser maior que zero'),
  vagasPorCemM2: z
    .number({ required_error: 'vagasPorCemM2 é obrigatório' })
    .nonnegative('vagasPorCemM2 não pode ser negativo'),
  adicionalSobreloja: z.boolean().optional(),
});

export const regraIndustrialSchema = z.object({
  tipo: z.literal('industrial'),
  coeficienteAproveitamento: z
    .number({ required_error: 'coeficienteAproveitamento é obrigatório' })
    .positive('coeficienteAproveitamento deve ser maior que zero'),
  taxaOcupacaoMaxima: z
    .number({ required_error: 'taxaOcupacaoMaxima é obrigatória' })
    .min(0.01, 'taxaOcupacaoMaxima mínima é 0.01')
    .max(1.0, 'taxaOcupacaoMaxima máxima é 1.0 (100%)'),
  recuoFrontalMinimo: z
    .number({ required_error: 'recuoFrontalMinimo é obrigatório' })
    .positive('recuoFrontalMinimo deve ser maior que zero'),
  recuoLateralMinimo: z
    .number({ required_error: 'recuoLateralMinimo é obrigatório' })
    .positive('recuoLateralMinimo deve ser maior que zero'),
  fatorEmissaoPoluentesMaximo: z
    .number({ required_error: 'fatorEmissaoPoluentesMaximo é obrigatório' })
    .min(0, 'fatorEmissaoPoluentesMaximo mínimo é 0')
    .max(10, 'fatorEmissaoPoluentesMaximo máximo é 10'),
});

export const regraZoneamentoSchema = z.discriminatedUnion('tipo', [
  regraResidencialSchema,
  regraComercialSchema,
  regraIndustrialSchema,
]);

export const calcularPotencialBodySchema = z.object({
  projetoId: z
    .string({ required_error: 'projetoId é obrigatório' })
    .min(1, 'projetoId não pode ser vazio'),
  usuarioId: z
    .string({ required_error: 'usuarioId é obrigatório' })
    .min(1, 'usuarioId não pode ser vazio'),
  areaTerreno: z
    .number({ required_error: 'areaTerreno é obrigatória' })
    .positive('areaTerreno deve ser maior que zero'),
  testadaPrincipal: z
    .number({ required_error: 'testadaPrincipal é obrigatória' })
    .positive('testadaPrincipal deve ser maior que zero'),
  regraZoneamento: regraZoneamentoSchema,
});

export type CalcularPotencialBodyInput = z.infer<
  typeof calcularPotencialBodySchema
>;

export function parseAndValidatePotencialInput(
  rawInput: unknown
): DadosProjetoUrbanistico {
  const parsed = calcularPotencialBodySchema.parse(rawInput);

  const regra = parsed.regraZoneamento;
  const recuoFrontal = toMetrosLineares(regra.recuoFrontalMinimo);

  if (regra.tipo === 'residencial') {
    return {
      projetoId: toProjetoId(parsed.projetoId),
      usuarioId: toUsuarioId(parsed.usuarioId),
      areaTerreno: toMetrosQuadrados(parsed.areaTerreno),
      testadaPrincipal: toMetrosLineares(parsed.testadaPrincipal),
      regraZoneamento: {
        tipo: 'residencial',
        coeficienteAproveitamento: regra.coeficienteAproveitamento,
        taxaOcupacaoMaxima: regra.taxaOcupacaoMaxima,
        recuoFrontalMinimo: recuoFrontal,
        numeroMaximoPavimentos: regra.numeroMaximoPavimentos,
      },
    };
  }

  if (regra.tipo === 'comercial') {
    return {
      projetoId: toProjetoId(parsed.projetoId),
      usuarioId: toUsuarioId(parsed.usuarioId),
      areaTerreno: toMetrosQuadrados(parsed.areaTerreno),
      testadaPrincipal: toMetrosLineares(parsed.testadaPrincipal),
      regraZoneamento: {
        tipo: 'comercial',
        coeficienteAproveitamento: regra.coeficienteAproveitamento,
        taxaOcupacaoMaxima: regra.taxaOcupacaoMaxima,
        recuoFrontalMinimo: recuoFrontal,
        vagasPorCemM2: regra.vagasPorCemM2,
        adicionalSobreloja: regra.adicionalSobreloja,
      },
    };
  }

  // industrial
  return {
    projetoId: toProjetoId(parsed.projetoId),
    usuarioId: toUsuarioId(parsed.usuarioId),
    areaTerreno: toMetrosQuadrados(parsed.areaTerreno),
    testadaPrincipal: toMetrosLineares(parsed.testadaPrincipal),
    regraZoneamento: {
      tipo: 'industrial',
      coeficienteAproveitamento: regra.coeficienteAproveitamento,
      taxaOcupacaoMaxima: regra.taxaOcupacaoMaxima,
      recuoFrontalMinimo: recuoFrontal,
      recuoLateralMinimo: toMetrosLineares(regra.recuoLateralMinimo),
      fatorEmissaoPoluentesMaximo: regra.fatorEmissaoPoluentesMaximo,
    },
  };
}
