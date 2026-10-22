import fs from 'node:fs';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { capturarMetricasMemoria } from '../domain/dados-espaciais.types.js';
import {
  garantirArquivoMassivoExiste,
  gerarArquivoEspacial,
} from '../domain/gerador-dados-espaciais.js';
import {
  processarComBuffer,
  processarComStream,
} from '../domain/processamento-memoria.service.js';
import {
  parseGerarArquivoInput,
  parseProcessamentoMemoriaInput,
} from '../schemas/memoria.schema.js';

export const memoriaRoutes: FastifyPluginAsync = async (app) => {
  function extrairParametros(request: { query: unknown; body: unknown }) {
    const raw = {
      ...(typeof request.query === 'object' && request.query !== null ? request.query : {}),
      ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
    };
    return parseProcessamentoMemoriaInput(raw);
  }

  function obterCaminhoPadrao(tamanhoMb: number, sufixo: string): string {
    return path.resolve(process.cwd(), 'data', `dados-espaciais-${tamanhoMb}mb${sufixo}.ndjson`);
  }

  function obterCaminhoSaidaPadrao(cenario: string): string {
    return path.resolve(process.cwd(), 'tmp', `saida-${cenario}.ndjson`);
  }

  /**
   * CENÁRIO A: Rota via Buffer Ingênuo
   * Lê o arquivo de 50MB a 100MB integralmente para a memória RAM com fs.readFile,
   * provocando um pico agudo no RSS e HeapUsed do Node.js.
   */
  const handleBuffer = async (request: any, reply: any) => {
    try {
      const params = extrairParametros(request);
      const caminhoEntrada = params.arquivoEntrada ?? obterCaminhoPadrao(params.tamanhoMb, '');
      const caminhoSaida = params.arquivoSaida ?? obterCaminhoSaidaPadrao('buffer');

      if (params.gerarSeNaoExistir) {
        await garantirArquivoMassivoExiste(caminhoEntrada, params.tamanhoMb * 1024 * 1024);
      }

      const resultado = await processarComBuffer(caminhoEntrada, caminhoSaida);

      return reply.status(200).send({
        cenario: 'A (Buffer Ingênuo - fs.readFile)',
        aviso: 'O arquivo foi lido inteiramente na RAM. Observe o pico no deltaRssMb e deltaHeapUsedMb.',
        resultado,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Parâmetros de processamento de memória inválidos',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro no processamento por Buffer',
      });
    }
  };

  app.get('/memoria/buffer', handleBuffer);
  app.post('/memoria/buffer', handleBuffer);

  /**
   * CENÁRIO B: Rota via Streams com Backpressure
   * Processa o arquivo utilizando stream.pipeline e Transform stream com chunks de 64KB,
   * mantendo a curva de consumo de memória estritamente horizontal e estável.
   */
  const handleStream = async (request: any, reply: any) => {
    try {
      const params = extrairParametros(request);
      const caminhoEntrada = params.arquivoEntrada ?? obterCaminhoPadrao(params.tamanhoMb, '');
      const caminhoSaida = params.arquivoSaida ?? obterCaminhoSaidaPadrao('stream');

      if (params.gerarSeNaoExistir) {
        await garantirArquivoMassivoExiste(caminhoEntrada, params.tamanhoMb * 1024 * 1024);
      }

      const resultado = await processarComStream(caminhoEntrada, caminhoSaida);

      return reply.status(200).send({
        cenario: 'B (Streams e Backpressure - stream.pipeline com chunks de 64KB)',
        aviso: 'O arquivo foi transformado em streaming. A memória permaneceu estável e mínima.',
        resultado,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Parâmetros de processamento de memória inválidos',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro no processamento por Stream',
      });
    }
  };

  app.get('/memoria/stream', handleStream);
  app.post('/memoria/stream', handleStream);

  /**
   * Rota Utilitária: Geração manual de arquivo de teste massivo
   */
  const handleGerarArquivo = async (request: any, reply: any) => {
    try {
      const raw = {
        ...(typeof request.query === 'object' && request.query !== null ? request.query : {}),
        ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
      };
      const params = parseGerarArquivoInput(raw);
      const caminhoArquivo = params.caminhoArquivo ?? obterCaminhoPadrao(params.tamanhoMb, '');

      const resultado = await gerarArquivoEspacial({
        caminhoArquivo,
        tamanhoAlvoBytes: params.tamanhoMb * 1024 * 1024,
      });

      return reply.status(201).send({
        status: 'criado',
        mensagem: `Arquivo massivo de ${params.tamanhoMb}MB gerado com sucesso`,
        resultado,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Parâmetros de geração de arquivo inválidos',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao gerar arquivo massivo',
      });
    }
  };

  app.get('/memoria/gerar-arquivo', handleGerarArquivo);
  app.post('/memoria/gerar-arquivo', handleGerarArquivo);

  /**
   * Observabilidade: Estado de memória e arquivos no disco
   */
  app.get('/memoria/status', async (_request, reply) => {
    const memoriaAtual = capturarMetricasMemoria();
    const dataDir = path.resolve(process.cwd(), 'data');
    const arquivos: Array<{ nome: string; tamanhoMb: number }> = [];

    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      for (const f of files) {
        if (f.endsWith('.ndjson')) {
          const stats = fs.statSync(path.join(dataDir, f));
          arquivos.push({
            nome: f,
            tamanhoMb: Math.round((stats.size / 1024 / 1024) * 100) / 100,
          });
        }
      }
    }

    return reply.status(200).send({
      timestamp: new Date().toISOString(),
      memoriaProcesso: memoriaAtual,
      arquivosDisponiveis: arquivos,
    });
  });
};
