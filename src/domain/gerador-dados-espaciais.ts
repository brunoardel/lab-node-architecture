import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { PontoEspacialInput } from './dados-espaciais.types.js';

export interface OpcoesGeradorEspacial {
  tamanhoAlvoBytes: number;
  caminhoArquivo: string;
  batchSize?: number;
  onProgresso?: (progresso: { bytesEscritos: number; totalAlvo: number; porcentagem: number }) => void;
}

export interface ResultadoGeracaoArquivo {
  caminhoArquivo: string;
  totalBytes: number;
  totalRegistros: number;
  tempoMs: number;
  tamanhoMb: number;
}

const ZONEAMENTOS = ['Residencial', 'Comercial', 'Industrial', 'Misto'] as const;

/**
 * Cria um objeto de ponto espacial sintético realista com dados de topografia e zoneamento.
 */
function gerarPontoEspacial(sequencia: number): PontoEspacialInput {
  const zonaIndex = sequencia % ZONEAMENTOS.length;
  const zoneamento = ZONEAMENTOS[zonaIndex] ?? 'Residencial';

  // Coordenadas simuladas em torno da Região Metropolitana de São Paulo
  const baseLat = -23.55052;
  const baseLng = -46.633308;
  const latOffset = ((sequencia * 17) % 10000) / 100000;
  const lngOffset = ((sequencia * 31) % 10000) / 100000;

  // Elevação topográfica simulada entre 520m e 1250m com padrão senoidal
  const elevacao = Math.round((750 + 350 * Math.sin(sequencia * 0.05) + (sequencia % 70)) * 10) / 10;
  const areaLoteM2 = 250 + (sequencia % 2000);
  const taxaOcupacao = Math.round((0.4 + ((sequencia % 40) / 100)) * 100) / 100;

  return {
    id: `GEO-${sequencia.toString().padStart(8, '0')}`,
    projetoId: `PRJ-URB-${(sequencia % 500).toString().padStart(4, '0')}`,
    latitude: Math.round((baseLat + latOffset) * 1000000) / 1000000,
    longitude: Math.round((baseLng + lngOffset) * 1000000) / 1000000,
    elevacao,
    zoneamento,
    areaLoteM2,
    taxaOcupacao,
  };
}

/**
 * Gera um arquivo massivo de dados espaciais no formato NDJSON (Newline Delimited JSON).
 *
 * Implementação orientada a Streams de alta performance:
 * - Escreve em blocos agregados (chunks de 64KB) para minimizar system calls.
 * - Monitora o buffer do WriteStream (`highWaterMark: 64KB`).
 * - Se `stream.write()` retornar false, aguarda o evento `drain` antes de prosseguir.
 *   Isso previne o estouro de memória durante a própria geração do arquivo gigante.
 */
export async function gerarArquivoEspacial(
  opcoes: OpcoesGeradorEspacial
): Promise<ResultadoGeracaoArquivo> {
  const inicio = performance.now();
  const { tamanhoAlvoBytes, caminhoArquivo, batchSize = 64 * 1024, onProgresso } = opcoes;

  // Assegura existência do diretório pai
  const dirPai = path.dirname(caminhoArquivo);
  if (!fs.existsSync(dirPai)) {
    fs.mkdirSync(dirPai, { recursive: true });
  }

  const writeStream = fs.createWriteStream(caminhoArquivo, {
    encoding: 'utf-8',
    highWaterMark: batchSize,
    flags: 'w',
  });

  let bytesEscritos = 0;
  let totalRegistros = 0;
  let bufferAcumulado = '';
  let ultimoProgressoReportado = 0;

  try {
    while (bytesEscritos < tamanhoAlvoBytes) {
      totalRegistros++;
      const ponto = gerarPontoEspacial(totalRegistros);
      const linha = JSON.stringify(ponto) + '\n';
      bufferAcumulado += linha;

      // Quando o acumulador atinge o tamanho de batch (64KB), descarrega na stream
      if (Buffer.byteLength(bufferAcumulado, 'utf-8') >= batchSize) {
        const chunkLength = Buffer.byteLength(bufferAcumulado, 'utf-8');
        const podeContinuar = writeStream.write(bufferAcumulado);
        bytesEscritos += chunkLength;
        bufferAcumulado = '';

        // Se o buffer interno do WriteStream atingiu o highWaterMark, respeita backpressure
        if (!podeContinuar) {
          await once(writeStream, 'drain');
        }

        // Notifica progresso a cada ~5MB gerados
        if (onProgresso && bytesEscritos - ultimoProgressoReportado >= 5 * 1024 * 1024) {
          ultimoProgressoReportado = bytesEscritos;
          const porcentagem = Math.min(100, Math.round((bytesEscritos / tamanhoAlvoBytes) * 100));
          onProgresso({ bytesEscritos, totalAlvo: tamanhoAlvoBytes, porcentagem });
        }
      }
    }

    // Despeja qualquer resíduo restante no buffer
    if (bufferAcumulado.length > 0) {
      const chunkLength = Buffer.byteLength(bufferAcumulado, 'utf-8');
      const podeContinuar = writeStream.write(bufferAcumulado);
      bytesEscritos += chunkLength;
      bufferAcumulado = '';

      if (!podeContinuar) {
        await once(writeStream, 'drain');
      }
    }

    // Finaliza a escrita e aguarda fechamento
    writeStream.end();
    await once(writeStream, 'finish');

    const fim = performance.now();
    const tempoMs = Math.round((fim - inicio) * 100) / 100;
    const tamanhoMb = Math.round((bytesEscritos / 1024 / 1024) * 100) / 100;

    if (onProgresso) {
      onProgresso({ bytesEscritos, totalAlvo: tamanhoAlvoBytes, porcentagem: 100 });
    }

    return {
      caminhoArquivo,
      totalBytes: bytesEscritos,
      totalRegistros,
      tempoMs,
      tamanhoMb,
    };
  } catch (erro) {
    writeStream.destroy();
    throw erro;
  }
}

/**
 * Garante que um arquivo massivo de teste exista no caminho especificado.
 * Se já existir e possuir tamanho compatível (ao menos 95% do alvo), reutiliza sem recriar.
 */
export async function garantirArquivoMassivoExiste(
  caminhoArquivo: string,
  tamanhoAlvoBytes: number,
  onProgresso?: (progresso: { bytesEscritos: number; totalAlvo: number; porcentagem: number }) => void
): Promise<{ criado: boolean; totalBytes: number; caminhoArquivo: string }> {
  if (fs.existsSync(caminhoArquivo)) {
    const stats = fs.statSync(caminhoArquivo);
    if (stats.size >= tamanhoAlvoBytes * 0.95) {
      return { criado: false, totalBytes: stats.size, caminhoArquivo };
    }
  }

  const resultado = await gerarArquivoEspacial({
    caminhoArquivo,
    tamanhoAlvoBytes,
    onProgresso,
  });

  return { criado: true, totalBytes: resultado.totalBytes, caminhoArquivo };
}
