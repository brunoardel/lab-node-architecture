import path from 'node:path';
import { buildApp } from '../src/app.js';
import { garantirArquivoMassivoExiste } from '../src/domain/gerador-dados-espaciais.js';
import { resetDefaultWorkerPool } from '../src/workers/worker-pool.js';

const PORT = 3334;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TAMANHO_TESTE_MB = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMb(mb: number): string {
  return `${mb.toFixed(2)} MB`;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

async function runDemo() {
  console.log('\n================================================================');
  console.log(' 🚀 EXPERIMENTO DE MEMÓRIA — BUFFER VS. STREAMS COM BACKPRESSURE');
  console.log('    Laboratório ArqLab: Ingestão de Dados Espaciais Massivos');
  console.log('================================================================\n');

  const caminhoEntrada = path.resolve(
    process.cwd(),
    'data',
    `dados-espaciais-${TAMANHO_TESTE_MB}mb.ndjson`
  );

  console.log(` 🔍 Verificando arquivo massivo de teste (${TAMANHO_TESTE_MB} MB)...`);
  const statusArquivo = await garantirArquivoMassivoExiste(
    caminhoEntrada,
    TAMANHO_TESTE_MB * 1024 * 1024,
    ({ porcentagem }) => {
      process.stdout.write(`\r    ⏳ Gerando arquivo de teste: [${porcentagem}%]...`);
    }
  );

  if (statusArquivo.criado) {
    console.log(`\n    ✅ Arquivo de ${(statusArquivo.totalBytes / 1024 / 1024).toFixed(1)} MB gerado com sucesso.`);
  } else {
    console.log(`    ✅ Arquivo existente reutilizado: ${(statusArquivo.totalBytes / 1024 / 1024).toFixed(1)} MB.`);
  }

  const app = buildApp({ logger: false });
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`\n 🌐 Servidor HTTP ativo em ${BASE_URL}\n`);

  try {
    // -------------------------------------------------------------
    // CENÁRIO A: Processamento via Buffer (fs.readFile)
    // -------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log(' 🔴 [CENÁRIO A] PROCESSAMENTO VIA BUFFER INGÊNUO: /memoria/buffer');
    console.log('    Carregando 50MB inteiramente para Buffer na memória RAM...');
    console.log('----------------------------------------------------------------');

    const resA = await fetch(`${BASE_URL}/memoria/buffer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tamanhoMb: TAMANHO_TESTE_MB,
        gerarSeNaoExistir: false,
      }),
    });

    const jsonA = (await resA.json()) as any;
    const resAData = jsonA.resultado;

    console.log(`\n 📊 Métricas do Cenário A (Buffer):`);
    console.log(`    - Status HTTP: ${resA.status}`);
    console.log(`    - Registros processados: ${resAData.totalRegistrosProcessados.toLocaleString('pt-BR')} pontos`);
    console.log(`    - Tempo de execução: ${formatMs(resAData.tempoProcessamentoMs)}`);
    console.log(`    - Throughput: ${resAData.taxaTransferenciaMbPorSegundo} MB/s`);
    console.log(`    - Memória RSS Inicial: ${formatMb(resAData.memoria.inicial.rssMb)}`);
    console.log(`    - 💥 PICO DE MEMÓRIA RSS: ${formatMb(resAData.memoria.pico.rssMb)}`);
    console.log(`    - 💥 PICO DE HEAP USADO:  ${formatMb(resAData.memoria.pico.heapUsedMb)}`);
    console.log(`    - ⚠️  DELTA RSS ABSORVIDO: +${formatMb(resAData.memoria.deltaRssMb)}`);
    console.log(`    - ⚠️  DELTA HEAP ABSORVIDO: +${formatMb(resAData.memoria.deltaHeapUsedMb)}`);

    console.log('\n ⏳ Aguardando 2 segundos para estabilização do Garbage Collector...');
    await sleep(2000);

    // -------------------------------------------------------------
    // CENÁRIO B: Processamento via Streams (stream.pipeline + Transform)
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log(' 🟢 [CENÁRIO B] PROCESSAMENTO VIA STREAMS E BACKPRESSURE: /memoria/stream');
    console.log('    Processando em chunks de 64KB com stream.pipeline...');
    console.log('----------------------------------------------------------------');

    const resB = await fetch(`${BASE_URL}/memoria/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tamanhoMb: TAMANHO_TESTE_MB,
        gerarSeNaoExistir: false,
      }),
    });

    const jsonB = (await resB.json()) as any;
    const resBData = jsonB.resultado;

    console.log(`\n 📊 Métricas do Cenário B (Streams):`);
    console.log(`    - Status HTTP: ${resB.status}`);
    console.log(`    - Registros processados: ${resBData.totalRegistrosProcessados.toLocaleString('pt-BR')} pontos`);
    console.log(`    - Tempo de execução: ${formatMs(resBData.tempoProcessamentoMs)}`);
    console.log(`    - Throughput: ${resBData.taxaTransferenciaMbPorSegundo} MB/s`);
    console.log(`    - Memória RSS Inicial: ${formatMb(resBData.memoria.inicial.rssMb)}`);
    console.log(`    - 🛡️  PICO DE MEMÓRIA RSS: ${formatMb(resBData.memoria.pico.rssMb)}`);
    console.log(`    - 🛡️  PICO DE HEAP USADO:  ${formatMb(resBData.memoria.pico.heapUsedMb)}`);
    console.log(`    - ✅ DELTA RSS: ${formatMb(resBData.memoria.deltaRssMb)}`);
    console.log(`    - ✅ DELTA HEAP: ${formatMb(resBData.memoria.deltaHeapUsedMb)}`);

    // -------------------------------------------------------------
    // TABELA COMPARATIVA E CONCLUSÕES ARQUITETURAIS
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(' 🏆 TABELA COMPARATIVA — CONSUMO DE MEMÓRIA & PERFORMANCE');
    console.log('================================================================');
    console.log(
      ` ${'Métrica'.padEnd(25)} | ${'Cenário A (Buffer)'.padEnd(22)} | ${'Cenário B (Streams)'.padEnd(22)}`
    );
    console.log('-'.repeat(75));
    console.log(
      ` ${'Tamanho do Arquivo'.padEnd(25)} | ${formatMb(resAData.tamanhoArquivoMb).padEnd(22)} | ${formatMb(resBData.tamanhoArquivoMb).padEnd(22)}`
    );
    console.log(
      ` ${'Registros Tratados'.padEnd(25)} | ${resAData.totalRegistrosProcessados.toLocaleString('pt-BR').padEnd(22)} | ${resBData.totalRegistrosProcessados.toLocaleString('pt-BR').padEnd(22)}`
    );
    console.log(
      ` ${'Tempo Total'.padEnd(25)} | ${formatMs(resAData.tempoProcessamentoMs).padEnd(22)} | ${formatMs(resBData.tempoProcessamentoMs).padEnd(22)}`
    );
    console.log(
      ` ${'Throughput (MB/s)'.padEnd(25)} | ${`${resAData.taxaTransferenciaMbPorSegundo} MB/s`.padEnd(22)} | ${`${resBData.taxaTransferenciaMbPorSegundo} MB/s`.padEnd(22)}`
    );
    console.log(
      ` ${'Pico de Heap (V8)'.padEnd(25)} | ${formatMb(resAData.memoria.pico.heapUsedMb).padEnd(22)} | ${formatMb(resBData.memoria.pico.heapUsedMb).padEnd(22)}`
    );
    console.log(
      ` ${'Pico RSS (Processo)'.padEnd(25)} | ${formatMb(resAData.memoria.pico.rssMb).padEnd(22)} | ${formatMb(resBData.memoria.pico.rssMb).padEnd(22)}`
    );
    console.log(
      ` ${'Delta RSS (Spike)'.padEnd(25)} | ${`+${formatMb(resAData.memoria.deltaRssMb)}`.padEnd(22)} | ${formatMb(resBData.memoria.deltaRssMb).padEnd(22)}`
    );
    console.log('================================================================');

    console.log('\n 💡 ANÁLISE ARQUITETURAL:');
    console.log('    1. No Cenário A, ler 50MB em Buffer gerou amplificação brutal de memória.');
    console.log('       A Heap do V8 acumulou milhares de objetos JavaScript e strings simultâneas,');
    console.log('       gerando um pico abrupto de RSS e alta pressão no coletor de lixo (GC).');
    console.log('    2. No Cenário B, a pipeline com chunks de 64KB manteve o consumo estável.');
    console.log('       A memória utilizada para cada chunk foi imediatamente liberada na geração');
    console.log('       jovem (Young Generation), sem retenção na Heap nem pico de RSS no processo.');
    console.log('    3. O backpressure garantiu que mesmo sob I/O de escrita, a leitura foi regulada');
    console.log('       automaticamente, assegurando resiliência operacional em larga escala!\n');
  } finally {
    await app.close();
    await resetDefaultWorkerPool();
  }
}

void runDemo();
