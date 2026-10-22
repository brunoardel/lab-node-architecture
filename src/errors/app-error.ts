/**
 * Classe abstrata base para todos os erros da aplicação.
 * Garante padronização estrutural entre erros operacionais e de infraestrutura.
 */
export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean = true;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Erros de Domínio (HTTP 4xx):
 * Representam violações de regras de negócio, dados inconsistentes ou parâmetros inválidos.
 * Devem ser comunicados detalhadamente ao cliente HTTP, pois refletem regras de negócio.
 */
export class DomainError extends AppError {
  public override readonly statusCode: number;
  public override readonly code: string;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      details?: unknown;
    }
  ) {
    super(message, options?.details);
    this.statusCode = options?.statusCode ?? 400;
    this.code = options?.code ?? 'DOMAIN_ERROR';
  }
}

/**
 * Erro de Domínio: Regra Urbanística Inválida (HTTP 400)
 */
export class RegraInvalidaError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, {
      statusCode: 400,
      code: 'REGRA_INVALIDA',
      details,
    });
  }
}

/**
 * Erro de Domínio: Parâmetro de Entrada Inválido (HTTP 400)
 */
export class ParametroInvalidoError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, {
      statusCode: 400,
      code: 'PARAMETRO_INVALIDO',
      details,
    });
  }
}

/**
 * Erro de Domínio: Zoneamento Não Suportado (HTTP 422 - Unprocessable Entity)
 */
export class ZoneamentoNaoSuportadoError extends DomainError {
  constructor(tipoZoneamento: string, details?: unknown) {
    super(`Zoneamento urbanístico não suportado ou não mapeado: '${tipoZoneamento}'`, {
      statusCode: 422,
      code: 'ZONEAMENTO_NAO_SUPORTADO',
      details,
    });
  }
}

/**
 * Erro de Domínio: Recurso/Projeto não encontrado (HTTP 404)
 */
export class ProjetoNaoEncontradoError extends DomainError {
  constructor(projetoId: string) {
    super(`Projeto urbanístico com ID '${projetoId}' não foi localizado.`, {
      statusCode: 404,
      code: 'PROJETO_NAO_ENCONTRADO',
      details: { projetoId },
    });
  }
}

/**
 * Erro de Domínio: Conflito de Regras Urbanísticas (HTTP 409)
 */
export class ConflitoRegraError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, {
      statusCode: 409,
      code: 'CONFLITO_REGRA',
      details,
    });
  }
}

/**
 * Erros de Infraestrutura (HTTP 5xx):
 * Representam falhas de I/O, Workers, filesystem, conectividade ou falhas não operacionais.
 * NUNCA devem expor stack traces ou detalhes sensíveis ao cliente em respostas HTTP,
 * mas DEVEM ser integralmente registrados no StructuredLogger com correlationId.
 */
export class InfraError extends AppError {
  public override readonly statusCode: number;
  public override readonly code: string;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      details?: unknown;
    }
  ) {
    super(message, options?.details);
    this.statusCode = options?.statusCode ?? 500;
    this.code = options?.code ?? 'INFRA_ERROR';
  }
}

/**
 * Erro de Infraestrutura: Falha na Worker Thread ou Pool de Concorrência (HTTP 500)
 */
export class WorkerPoolFalhaError extends InfraError {
  constructor(message: string, details?: unknown) {
    super(message, {
      statusCode: 500,
      code: 'WORKER_POOL_FALHA',
      details,
    });
  }
}

/**
 * Erro de Infraestrutura: Arquivo Inacessível no Filesystem (HTTP 500)
 */
export class ArquivoInacessivelError extends InfraError {
  constructor(caminho: string, details?: unknown) {
    super(`Falha ao acessar ou persistir arquivo espacial no caminho: '${caminho}'`, {
      statusCode: 500,
      code: 'ARQUIVO_INACESSIVEL',
      details: { caminho, details },
    });
  }
}

/**
 * Erro de Infraestrutura: Timeout de Processamento Assíncrono (HTTP 504 - Gateway Timeout)
 */
export class TimeoutProcessamentoError extends InfraError {
  constructor(operacao: string, timeoutMs: number) {
    super(`Tempo limite de ${timeoutMs}ms excedido na operação assíncrona: '${operacao}'`, {
      statusCode: 504,
      code: 'TIMEOUT_PROCESSAMENTO',
      details: { operacao, timeoutMs },
    });
  }
}
