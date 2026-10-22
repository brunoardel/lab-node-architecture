import { z } from 'zod';

export const ProcessamentoMemoriaInputSchema = z.object({
  tamanhoMb: z.coerce
    .number()
    .min(1, 'O tamanho mínimo de teste é 1 MB')
    .max(500, 'O tamanho máximo suportado no lab é 500 MB')
    .default(50),
  arquivoEntrada: z.string().optional(),
  arquivoSaida: z.string().optional(),
  gerarSeNaoExistir: z.coerce.boolean().default(true),
});

export type ProcessamentoMemoriaInput = z.infer<typeof ProcessamentoMemoriaInputSchema>;

export const GerarArquivoInputSchema = z.object({
  tamanhoMb: z.coerce
    .number()
    .min(1, 'O tamanho mínimo de arquivo é 1 MB')
    .max(500, 'O tamanho máximo suportado no lab é 500 MB')
    .default(50),
  caminhoArquivo: z.string().optional(),
});

export type GerarArquivoInput = z.infer<typeof GerarArquivoInputSchema>;

export function parseProcessamentoMemoriaInput(data: unknown): ProcessamentoMemoriaInput {
  return ProcessamentoMemoriaInputSchema.parse(data);
}

export function parseGerarArquivoInput(data: unknown): GerarArquivoInput {
  return GerarArquivoInputSchema.parse(data);
}
