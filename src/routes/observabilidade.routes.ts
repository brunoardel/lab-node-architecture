import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { appLogger } from '../observability/logger.js';
import { getCorrelationContext, getCorrelationId } from '../observability/correlation-context.js';
import {
  projetoAuditoriaService,
  CriarProjetoInput,
} from '../services/projeto-auditoria.service.js';
import {
  RegraInvalidaError,
  WorkerPoolFalhaError,
} from '../errors/app-error.js';

const criarProjetoSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').default('Edifício Horizon'),
  tipoZoneamento: z.enum(['Residencial', 'Comercial', 'Industrial']).default('Residencial'),
  areaTerrenoM2: z.number().positive('Área deve ser positiva').default(450),
});

export const observabilidadeRoutes: FastifyPluginAsync = async (app) => {
  const controllerLogger = appLogger.child({ component: 'ObservabilidadeController' });

  /**
   * Demonstração de Rastreamento Ponta a Ponta:
   * Controller -> Service -> Repository
   * Todos recuperam o correlationId do AsyncLocalStorage sem receber 'req'.
   */
  app.post('/api/observabilidade/rastreamento-camadas', async (request, reply) => {
    controllerLogger.info('Requisição recebida na camada Controller', {
      camada: 'Controller',
      path: request.url,
      method: request.method,
    });

    const bodyValidado = criarProjetoSchema.parse(request.body ?? {});

    const resultado = await projetoAuditoriaService.registrarProjetoComAuditoria(
      bodyValidado as CriarProjetoInput
    );

    controllerLogger.info('Resposta gerada com sucesso pela camada Controller', {
      camada: 'Controller',
      projetoId: resultado.projeto.id,
    });

    const correlationIdAtivo = getCorrelationId();

    // Filtra logs emitidos em memória durante esta requisição específica
    const logsDestaRequisicao = appLogger
      .getMemoryLogs()
      .filter((entry) => entry.correlationId === correlationIdAtivo);

    return reply.status(201).send({
      mensagem: 'Rastreabilidade com AsyncLocalStorage executada com sucesso!',
      correlationId: correlationIdAtivo,
      projeto: resultado.projeto,
      camadasAuditadas: ['Controller', 'Service', 'Repository'],
      totalLogsRegistrados: logsDestaRequisicao.length,
      logs: logsDestaRequisicao.map((log) => ({
        timestamp: log.timestamp,
        level: log.level,
        component: log.component,
        message: log.message,
        correlationId: log.correlationId,
        metadata: log.metadata,
      })),
    });
  });

  /**
   * Endpoint de inspeção do CorrelationContext em tempo real
   */
  app.get('/api/observabilidade/contexto', async (_request, reply) => {
    const contexto = getCorrelationContext();
    return reply.status(200).send({
      correlationId: getCorrelationId(),
      contextoAtivo: contexto ?? null,
    });
  });

  /**
   * Endpoint de Demonstração: Simulação de Erro de Domínio (HTTP 400/4xx)
   * Capturado pelo errorHandlerPlugin e serializado sem vazar stack trace.
   */
  app.get('/api/observabilidade/simular-erro-dominio', async () => {
    throw new RegraInvalidaError(
      'Área informada (80m²) é inferior ao lote mínimo urbanístico obrigatório (125m²).',
      {
        areaInformada: 80,
        areaMinimaExigida: 125,
        leiUrbanistica: 'Plano Diretor Municipal - Art. 42',
      }
    );
  });

  /**
   * Endpoint de Demonstração: Simulação de Erro de Infraestrutura (HTTP 500)
   * Capturado pelo errorHandlerPlugin, stack trace salva internamente e resposta sanitizada.
   */
  app.get('/api/observabilidade/simular-erro-infra', async () => {
    throw new WorkerPoolFalhaError('Worker Thread pool falhou ao comunicar com o processo filho.', {
      workerId: 2,
      threadId: 104,
      codigoSaida: 1,
    });
  });

  /**
   * Endpoint de Demonstração: Simulação de Erro Inesperado não tratado (HTTP 500)
   */
  app.get('/api/observabilidade/simular-erro-inesperado', async () => {
    throw new Error('Falha grave inesperada na memória ou ponteiro nativo.');
  });

  /**
   * Consulta por ID demonstrando DomainError 404 se não encontrado
   */
  app.get('/api/observabilidade/projetos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projeto = await projetoAuditoriaService.consultarProjeto(id);
    return reply.status(200).send(projeto);
  });
};
