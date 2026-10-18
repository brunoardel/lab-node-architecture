/**
 * Função utilitária para garantir verificação estrita e exaustiva em tempo de compilação.
 * Se houver algum caso de discriminated union não tratado em um switch,
 * o compilador TypeScript apontará erro de tipo ao passar o valor para assertNever.
 */
export function assertNever(x: never): never {
  throw new Error(`Caso não tratado no switch exaustivo: ${JSON.stringify(x)}`);
}
