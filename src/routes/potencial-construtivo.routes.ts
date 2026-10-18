import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { calcularPotencialConstrutivo } from '../domain/calculo-potencial.service.js';
import { parseAndValidatePotencialInput } from '../schemas/potencial-construtivo.schema.js';

export const potencialConstrutivoRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/zoneamento/calcular', async (request, reply) => {
    try {
      const dadosValidados = parseAndValidatePotencialInput(request.body);
      const resultado = calcularPotencialConstrutivo(dadosValidados);
      return reply.status(200).send(resultado);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Falha na validação dos dados de zoneamento',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: error.message,
        });
      }

      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Erro interno ao processar o cálculo',
      });
    }
  });
};
