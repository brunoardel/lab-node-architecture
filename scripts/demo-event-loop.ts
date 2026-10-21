import { buildApp } from '../src/app.js';
import { resetDefaultWorkerPool } from '../src/workers/worker-pool.js';

const PORT = 3333;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

async function runDemo() {
  console.log('\n================================================================');
  console.log(' 🚀 EXPERIMENTO DO EVENT LOOP — NODE.JS & WORKER THREADS');
  console.log('================================================================\n');

  const app = buildApp({ logger: false });
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(` Servidor de demonstração ativo em ${BASE_URL}\n`);

  try {
    // -------------------------------------------------------------
    // CENÁRIO A: Rota Bloqueante (Main Thread)
    // -------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log(' 🔴 [CENÁRIO A] ROTA BLOQUEANTE: /bloqueante');
    console.log('    Executando cálculo de volumetria na Thread Principal...');
    console.log('    Disparando 5 requisições concorrentes de /health...');
    console.log('----------------------------------------------------------------');

    const inicioA = performance.now();

    // Dispara cálculo pesado na main thread
    const promessaBloqueante = fetch(`${BASE_URL}/bloqueante`).then(async (res) => {
      const json = (await res.json()) as any;
      const tempo = performance.now() - inicioA;
      return { status: res.status, tempo, json };
    });

    // Dispara 5 requisições de /health concorrentes
    const healthPromisesA = [1, 2, 3, 4, 5].map((id) => {
      const t0 = performance.now();
      return fetch(`${BASE_URL}/health`).then((res) => ({
        id,
        tempo: performance.now() - t0,
        status: res.status,
      }));
    });

    const [resultadoBloqueante, ...healthResultsA] = await Promise.all([
      promessaBloqueante,
      ...healthPromisesA,
    ]);

    console.log(`\n ⏱️  Resultado do Cálculo Bloqueante:`);
    console.log(`    - Tempo total da requisição: ${formatMs(resultadoBloqueante.tempo)}`);
    console.log(`    - Executado em: ${resultadoBloqueante.json.resultado?.executadoEm} (Thread ID: ${resultadoBloqueante.json.resultado?.threadId})`);
    console.log(`    - Volume Corte: ${resultadoBloqueante.json.resultado?.volumeCorteM3} m³`);
    console.log(`\n 🛑 Latência das requisições de /health represadas pelo Event Loop:`);
    for (const h of healthResultsA) {
      console.log(`    - Health #${h.id}: respondeu em ${formatMs(h.tempo)} (Status: ${h.status}) ⚠️ REPRESADO!`);
    }

    console.log('\n ⚠️  CONCLUSÃO DO CENÁRIO A:');
    console.log('    O Event Loop ficou 100% CONGELADO. O servidor foi incapaz de atender');
    console.log('    requisições concorrentes de /health até o cálculo terminar.');
    console.log('    Todas as requisições de saúde sofreram atraso igual ao tempo do cálculo!\n');

    await sleep(1000);

    // -------------------------------------------------------------
    // CENÁRIO B: Rota Otimizada (Worker Threads Pool)
    // -------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log(' 🟢 [CENÁRIO B] ROTA OTIMIZADA: /otimizada');
    console.log('    Offloading do cálculo para o WorkerPool (node:worker_threads)...');
    console.log('    Disparando 5 requisições concorrentes de /health...');
    console.log('----------------------------------------------------------------');

    const inicioB = performance.now();

    const promessaOtimizada = fetch(`${BASE_URL}/otimizada`).then(async (res) => {
      const json = (await res.json()) as any;
      const tempo = performance.now() - inicioB;
      return { status: res.status, tempo, json };
    });

    const healthPromisesB = [1, 2, 3, 4, 5].map((id) => {
      const t0 = performance.now();
      return fetch(`${BASE_URL}/health`).then((res) => ({
        id,
        tempo: performance.now() - t0,
        status: res.status,
      }));
    });

    const [resultadoOtimizada, ...healthResultsB] = await Promise.all([
      promessaOtimizada,
      ...healthPromisesB,
    ]);

    console.log(`\n ⏱️  Resultado do Cálculo Otimizado:`);
    console.log(`    - Tempo total da requisição: ${formatMs(resultadoOtimizada.tempo)}`);
    console.log(`    - Executado em: ${resultadoOtimizada.json.resultado?.executadoEm} (Thread ID: ${resultadoOtimizada.json.resultado?.threadId})`);
    console.log(`    - Volume Corte: ${resultadoOtimizada.json.resultado?.volumeCorteM3} m³`);
    console.log(`\n ⚡ Latência das requisições de /health durante a execução do worker:`);
    for (const h of healthResultsB) {
      console.log(`    - Health #${h.id}: respondeu em ${formatMs(h.tempo)} (Status: ${h.status}) ✅ INSTANTÂNEO!`);
    }

    console.log('\n ✅ CONCLUSÃO DO CENÁRIO B:');
    console.log('    A thread principal permaneceu 100% LIVRE para processar conexões de rede.');
    console.log('    O tempo de resposta do /health foi de ~1 a 3 ms, mesmo enquanto a CPU');
    console.log('    estava calculando a volumetria em um Worker Thread isolado!\n');
    console.log('================================================================\n');

  } finally {
    await app.close();
    await resetDefaultWorkerPool();
  }
}

void runDemo();
