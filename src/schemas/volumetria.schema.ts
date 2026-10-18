import { z } from 'zod';
import { ParametrosVolumetria } from '../domain/volumetria.types.js';

export const volumetriaQuerySchema = z.object({
  dimensaoGrid: z.coerce
    .number()
    .int('A dimensão do grid deve ser um número inteiro')
    .min(10, 'O grid mínimo é de 10x10 células')
    .max(2000, 'O grid máximo suportado é de 2000x2000 células')
    .optional(),
  cotaProjeto: z.coerce.number().optional(),
  fatorEmpolamento: z.coerce
    .number()
    .positive('O fator de empolamento deve ser positivo')
    .max(5, 'O fator de empolamento não pode exceder 5.0')
    .optional(),
  iteracoes: z.coerce
    .number()
    .int('A quantidade de iterações deve ser um número inteiro')
    .min(100, 'Mínimo de 100 iterações')
    .max(500_000_000, 'Máximo de 500.000.000 de iterações')
    .optional(),
});

export type VolumetriaQueryParams = z.infer<typeof volumetriaQuerySchema>;

export function parseVolumetriaInput(input: unknown): ParametrosVolumetria {
  return volumetriaQuerySchema.parse(input);
}
