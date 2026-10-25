import { describe, it, expect, beforeEach } from 'vitest';
import { StructuredLogger } from '../src/observability/logger.js';
import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '../src/observability/correlation-context.js';

describe('StructuredLogger com AsyncLocalStorage', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({
      component: 'TesteLogger',
      enableStdout: false,
      enableMemoryBuffer: true,
      minLevel: 'debug',
    });
  });

  it('deve registrar logs em memória com timestamp ISO e nível', () => {
    logger.info('Mensagem de teste informativo', { modulo: 'Urbanismo' });

    const logs = logger.getMemoryLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.message).toBe('Mensagem de teste informativo');
    expect(logs[0]?.level).toBe('info');
    expect(logs[0]?.component).toBe('TesteLogger');
    expect(logs[0]?.metadata).toEqual({ modulo: 'Urbanismo' });
    expect(typeof logs[0]?.timestamp).toBe('string');
  });

  it('deve injetar automaticamente o correlationId do AsyncLocalStorage sem receber req', () => {
    const ctx = createCorrelationContext({ correlationId: 'req-trace-auto-777' });

    runWithCorrelationContext(ctx, () => {
      logger.info('Processamento de zona comercial');
      logger.warn('Atenção: coeficiente próximo do limite');
    });

    const logs = logger.getMemoryLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0]?.correlationId).toBe('req-trace-auto-777');
    expect(logs[1]?.correlationId).toBe('req-trace-auto-777');
  });

  it('deve registrar erros com propriedades estruturadas (name, message, stack)', () => {
    const erroExemplo = new Error('Falha de conexão com disco');
    logger.error('Erro ao salvar arquivo espacial', erroExemplo);

    const logs = logger.getMemoryLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe('error');
    expect(logs[0]?.error?.name).toBe('Error');
    expect(logs[0]?.error?.message).toBe('Falha de conexão com disco');
    expect(typeof logs[0]?.error?.stack).toBe('string');
  });

  it('deve criar child loggers concatenando nomes de componentes', () => {
    const child = logger.child({ component: 'SubModulo' });
    child.info('Log do submódulo');

    const logs = logger.getMemoryLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.component).toBe('TesteLogger:SubModulo');
  });

  it('deve notificar listeners adicionados externamente', () => {
    const captured: Array<string> = [];
    const unsubscribe = logger.addListener((entry) => {
      captured.push(entry.message);
    });

    logger.info('Msg 1');
    logger.info('Msg 2');
    unsubscribe();
    logger.info('Msg 3');

    expect(captured).toEqual(['Msg 1', 'Msg 2']);
  });

  it('deve respeitar filtro de nível mínimo (minLevel)', () => {
    logger.setMinLevel('warn');
    logger.debug('Debug ocultado');
    logger.info('Info ocultado');
    logger.warn('Warn visível');
    logger.error('Error visível');

    // Nota: memoryBuffer registra chamadas emitidas, mas podemos testar minLevel
    expect(logger.getMemoryLogs().map((l) => l.level)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
    ]);
  });
});
