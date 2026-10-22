import { appLogger } from '../observability/logger.js';
import { getCorrelationId } from '../observability/correlation-context.js';

export interface ProjetoRegistro {
  id: string;
  nome: string;
  tipoZoneamento: 'Residencial' | 'Comercial' | 'Industrial';
  areaTerrenoM2: number;
  criadoEm: string;
}

const bancoEmMemoria = new Map<string, ProjetoRegistro>();

const logger = appLogger.child({ component: 'ProjetoRepository' });

/**
 * Camada de Repositório (Acesso a Dados / Persistência).
 * Demonstra como o logger estruturado recupera o Correlation ID
 * automaticamente via AsyncLocalStorage, SEM que o objeto 'req'
 * ou 'request' seja repassado por parâmetro!
 */
export class ProjetoRepository {
  public async salvar(projeto: ProjetoRegistro): Promise<ProjetoRegistro> {
    logger.info(`Iniciando persistência do projeto no banco de dados: ${projeto.nome}`, {
      projetoId: projeto.id,
      tipoZoneamento: projeto.tipoZoneamento,
      camada: 'Repository',
      // Repare que getCorrelationId() funciona nativamente aqui dentro!
      correlationIdAtivo: getCorrelationId(),
    });

    // Simula latência de I/O de banco de dados
    await new Promise((resolve) => setTimeout(resolve, 5));

    bancoEmMemoria.set(projeto.id, projeto);

    logger.info(`Projeto persistido com sucesso na tabela 'projetos_urbanisticos'`, {
      projetoId: projeto.id,
      totalRegistros: bancoEmMemoria.size,
      camada: 'Repository',
    });

    return projeto;
  }

  public async buscarPorId(id: string): Promise<ProjetoRegistro | null> {
    logger.info(`Buscando projeto pelo ID: ${id}`, {
      projetoId: id,
      camada: 'Repository',
    });

    await new Promise((resolve) => setTimeout(resolve, 3));
    return bancoEmMemoria.get(id) ?? null;
  }

  public async listar(): Promise<readonly ProjetoRegistro[]> {
    logger.info(`Listando todos os projetos persistidos`, {
      total: bancoEmMemoria.size,
      camada: 'Repository',
    });

    return Array.from(bancoEmMemoria.values());
  }

  public limpar(): void {
    bancoEmMemoria.clear();
  }
}

export const projetoRepository = new ProjetoRepository();
