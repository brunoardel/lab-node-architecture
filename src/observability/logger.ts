import { getCorrelationContext, getCorrelationId } from './correlation-context.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  component?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export type LogListener = (entry: LogEntry) => void;

export interface LoggerOptions {
  component?: string;
  minLevel?: LogLevel;
  enableStdout?: boolean;
  enableMemoryBuffer?: boolean;
  maxMemoryLogs?: number;
  memoryLogs?: LogEntry[];
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Logger estruturado de alta performance que recupera automaticamente
 * o correlationId / requestId do AsyncLocalStorage atual, dispensando
 * a passagem do objeto de requisição (req/request) por controllers, services e repositories.
 */
export class StructuredLogger {
  private readonly component?: string;
  private minLevel: LogLevel;
  private enableStdout: boolean;
  private enableMemoryBuffer: boolean;
  private readonly maxMemoryLogs: number;
  private readonly memoryLogs: LogEntry[];
  private readonly listeners: Set<LogListener> = new Set();

  constructor(options: LoggerOptions = {}) {
    this.component = options.component;
    this.minLevel = options.minLevel ?? ((process.env['LOG_LEVEL'] as LogLevel) || 'info');
    this.enableStdout = options.enableStdout ?? (process.env['NODE_ENV'] !== 'test');
    this.enableMemoryBuffer = options.enableMemoryBuffer ?? true;
    this.maxMemoryLogs = options.maxMemoryLogs ?? 500;
    this.memoryLogs = options.memoryLogs ?? [];
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public setEnableStdout(enabled: boolean): void {
    this.enableStdout = enabled;
  }

  public addListener(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getMemoryLogs(): readonly LogEntry[] {
    return [...this.memoryLogs];
  }

  public clearMemoryLogs(): void {
    this.memoryLogs.length = 0;
  }

  public child(context: { component?: string; [key: string]: unknown }): StructuredLogger {
    const childComponent = context.component
      ? this.component
        ? `${this.component}:${context.component}`
        : context.component
      : this.component;

    const childLogger = new StructuredLogger({
      component: childComponent,
      minLevel: this.minLevel,
      enableStdout: this.enableStdout,
      enableMemoryBuffer: this.enableMemoryBuffer,
      maxMemoryLogs: this.maxMemoryLogs,
      memoryLogs: this.memoryLogs,
    });

    // Reencaminha eventos dos listeners
    childLogger.addListener((entry) => {
      for (const listener of this.listeners) {
        listener(entry);
      }
    });

    return childLogger;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[this.minLevel];
  }

  private emit(
    level: LogLevel,
    message: string,
    metadataOrError?: Record<string, unknown> | Error,
    explicitDurationMs?: number
  ): LogEntry {
    let metadata: Record<string, unknown> | undefined;
    let errorObj: LogEntry['error'] | undefined;

    if (metadataOrError instanceof Error) {
      errorObj = {
        name: metadataOrError.name,
        message: metadataOrError.message,
        stack: metadataOrError.stack,
        code: (metadataOrError as { code?: string }).code,
      };
    } else if (metadataOrError && typeof metadataOrError === 'object') {
      const { err, error, durationMs, ...rest } = metadataOrError as {
        err?: unknown;
        error?: unknown;
        durationMs?: number;
        [key: string]: unknown;
      };

      const foundError = err instanceof Error ? err : error instanceof Error ? error : undefined;
      if (foundError) {
        errorObj = {
          name: foundError.name,
          message: foundError.message,
          stack: foundError.stack,
          code: (foundError as { code?: string }).code,
        };
      }

      if (durationMs !== undefined && explicitDurationMs === undefined) {
        explicitDurationMs = durationMs;
      }

      if (Object.keys(rest).length > 0) {
        metadata = rest;
      }
    }

    const context = getCorrelationContext();
    const correlationId = context?.correlationId ?? getCorrelationId();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(correlationId ? { correlationId } : {}),
      ...(this.component ? { component: this.component } : {}),
      ...(explicitDurationMs !== undefined ? { durationMs: explicitDurationMs } : {}),
      ...(metadata ? { metadata } : {}),
      ...(errorObj ? { error: errorObj } : {}),
    };

    if (this.enableMemoryBuffer) {
      this.memoryLogs.push(entry);
      if (this.memoryLogs.length > this.maxMemoryLogs) {
        this.memoryLogs.shift();
      }
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Ignora falhas em listeners externos
      }
    }

    if (this.shouldLog(level) && this.enableStdout) {
      const formatted = JSON.stringify(entry);
      if (level === 'error') {
        process.stderr.write(formatted + '\n');
      } else {
        process.stdout.write(formatted + '\n');
      }
    }

    return entry;
  }

  public debug(message: string, meta?: Record<string, unknown>): LogEntry {
    return this.emit('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>, durationMs?: number): LogEntry {
    return this.emit('info', message, meta, durationMs);
  }

  public warn(message: string, metaOrError?: Record<string, unknown> | Error): LogEntry {
    return this.emit('warn', message, metaOrError);
  }

  public error(
    message: string,
    metaOrError?: Record<string, unknown> | Error,
    durationMs?: number
  ): LogEntry {
    return this.emit('error', message, metaOrError, durationMs);
  }
}

/**
 * Instância global singleton do StructuredLogger padrão da aplicação.
 */
export const appLogger = new StructuredLogger({
  component: 'App',
});
