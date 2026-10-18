declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ProjetoId = Brand<string, 'ProjetoId'>;
export type UsuarioId = Brand<string, 'UsuarioId'>;
export type MetrosQuadrados = Brand<number, 'MetrosQuadrados'>;
export type MetrosLineares = Brand<number, 'MetrosLineares'>;

export function toProjetoId(id: string): ProjetoId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('ProjetoId inválido: deve ser uma string não vazia.');
  }
  return id as ProjetoId;
}

export function toUsuarioId(id: string): UsuarioId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('UsuarioId inválido: deve ser uma string não vazia.');
  }
  return id as UsuarioId;
}

export function toMetrosQuadrados(valor: number): MetrosQuadrados {
  if (typeof valor !== 'number' || Number.isNaN(valor) || valor <= 0) {
    throw new Error('MetrosQuadrados inválido: deve ser um número positivo maior que zero.');
  }
  return valor as MetrosQuadrados;
}

export function toMetrosLineares(valor: number): MetrosLineares {
  if (typeof valor !== 'number' || Number.isNaN(valor) || valor <= 0) {
    throw new Error('MetrosLineares inválido: deve ser um número positivo maior que zero.');
  }
  return valor as MetrosLineares;
}
