import { describe, it, expect } from 'vitest';
import {
  createCorrelationContext,
  getCorrelationContext,
  getCorrelationId,
  runWithCorrelationContext,
  setContextMetadata,
} from '../src/observability/correlation-context.js';

describe('CorrelationContext & AsyncLocalStorage', () => {
  it('deve retornar undefined quando chamado fora de qualquer contexto assíncrono', () => {
    expect(getCorrelationContext()).toBeUndefined();
    expect(getCorrelationId()).toBeUndefined();
    expect(getCorrelationId('fallback-123')).toBe('fallback-123');
  });

  it('deve criar e propagar o correlationId dentro do escopo assíncrono', () => {
    const context = createCorrelationContext({
      correlationId: 'req-alpha-001',
      method: 'GET',
      path: '/api/zoneamento',
    });

    runWithCorrelationContext(context, () => {
      expect(getCorrelationId()).toBe('req-alpha-001');
      const active = getCorrelationContext();
      expect(active?.correlationId).toBe('req-alpha-001');
      expect(active?.requestId).toBe('req-alpha-001');
      expect(active?.method).toBe('GET');
      expect(active?.path).toBe('/api/zoneamento');
      expect(typeof active?.startTime).toBe('number');
    });

    // Fora do escopo, volta a ser undefined
    expect(getCorrelationContext()).toBeUndefined();
  });

  it('deve manter o contexto através de múltiplos saltos assíncronos (async/await, Promise, setTimeout)', async () => {
    const context = createCorrelationContext({ correlationId: 'async-chain-999' });

    await runWithCorrelationContext(context, async () => {
      expect(getCorrelationId()).toBe('async-chain-999');

      // Salto 1: await Promise
      await Promise.resolve().then(() => {
        expect(getCorrelationId()).toBe('async-chain-999');
      });

      // Salto 2: setTimeout com macro-task
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(getCorrelationId()).toBe('async-chain-999');
          resolve();
        }, 10);
      });

      // Salto 3: chamada de função aninhada
      async function funcaoAninhada() {
        await new Promise((r) => process.nextTick(r));
        return getCorrelationId();
      }

      const idAninhado = await funcaoAninhada();
      expect(idAninhado).toBe('async-chain-999');
    });
  });

  it('deve isolar estritamente contextos de operações concorrentes', async () => {
    async function simularOperacao(id: string, delayMs: number): Promise<string | undefined> {
      const ctx = createCorrelationContext({ correlationId: id });
      return runWithCorrelationContext(ctx, async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return getCorrelationId();
      });
    }

    const [res1, res2, res3] = await Promise.all([
      simularOperacao('op-1', 25),
      simularOperacao('op-2', 10),
      simularOperacao('op-3', 15),
    ]);

    expect(res1).toBe('op-1');
    expect(res2).toBe('op-2');
    expect(res3).toBe('op-3');
  });

  it('deve permitir inclusão de metadados durante a execução no contexto', () => {
    const context = createCorrelationContext({ correlationId: 'meta-ctx-42' });

    runWithCorrelationContext(context, () => {
      setContextMetadata('usuarioId', 'user-888');
      setContextMetadata('tenant', 'arqlab-sp');

      const ativo = getCorrelationContext();
      expect(ativo?.metadata?.['usuarioId']).toBe('user-888');
      expect(ativo?.metadata?.['tenant']).toBe('arqlab-sp');
    });
  });
});
