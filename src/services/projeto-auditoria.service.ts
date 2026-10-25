import crypto from 'node:crypto';
import { appLogger } from '../observability/logger.js';
import { projetoRepository, ProjetoRegistro } from '../repository/projeto.repository.js';
import { RegraInvalidaError, ProjetoNaoEncontradoError } from '../errors/app-error.js';
import { getCorrelationId } from '../observability/correlation-context.js';

export interface CriarProjetoInput {
  nome: string;
  tipoZoneamento: 'Residencial' | 'Comercial' | 'Industrial';
  areaTerrenoM2: number;
}

const logger = appLogger.child({ component: 'ProjetoAuditoriaService' });

/**
 * Camada de Serviço (Lógica de Negócios / Domínio).
 * Invoca regras de negócio e chama o Repositório.
 * Repare: não recebe nenhum objeto 'req' ou 'requestId'. O rastreamento
 * assíncrono é transparente graças ao AsyncLocalStorage.
 */
export class ProjetoAuditoriaService {
  public async registrarProjetoComAuditoria(
    input: CriarProjetoInput
  ): Promise<{ projeto: ProjetoRegistro; correlationId: string }> {
    logger.info(`Iniciando validação das regras de auditoria para o projeto: ${input.nome}`, {
      nome: input.nome,
      tipoZoneamento: input.tipoZoneamento,
      areaTerrenoM2: input.areaTerrenoM2,
      camada: 'Service',
    });

    if (input.areaTerrenoM2 <= 0) {
      throw new RegraInvalidaError('Área do terreno deve ser estritamente positiva.', {
        areaInformada: input.areaTerrenoM2,
      });
    }

    if (input.tipoZoneamento === 'Industrial' && input.areaTerrenoM2 < 500) {
      throw new RegraInvalidaError(
        'Projetos industriais exigem área mínima de terreno de 500m².',
        { areaMinimaExigida: 500, areaInformada: input.areaTerrenoM2 }
      );
    }

    const novoProjeto: ProjetoRegistro = {
      id: crypto.randomUUID(),
      nome: input.nome,
      tipoZoneamento: input.tipoZoneamento,
      areaTerrenoM2: input.areaTerrenoM2,
      criadoEm: new Date().toISOString(),
    };

    logger.info(`Regras de negócio aprovadas. Chamando camada de persistência...`, {
      projetoId: novoProjeto.id,
      camada: 'Service',
    });

    const projetoPersistido = await projetoRepository.salvar(novoProjeto);

    const correlationId = getCorrelationId() ?? 'sem-id';

    logger.info(`Fluxo de serviço finalizado com sucesso`, {
      projetoId: projetoPersistido.id,
      camada: 'Service',
      correlationId,
    });

    return {
      projeto: projetoPersistido,
      correlationId,
    };
  }

  public async consultarProjeto(id: string): Promise<ProjetoRegistro> {
    logger.info(`Consultando projeto no serviço: ${id}`, {
      projetoId: id,
      camada: 'Service',
    });

    const projeto = await projetoRepository.buscarPorId(id);
    if (!projeto) {
      throw new ProjetoNaoEncontradoError(id);
    }

    return projeto;
  }
}

export const projetoAuditoriaService = new ProjetoAuditoriaService();
