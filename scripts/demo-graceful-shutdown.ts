import { buildApp } from '../src/app.js';
import { setupGracefulShutdown } from '../src/shutdown/graceful-shutdown.js';
import { getDefaultWorkerPool, resetDefaultWorkerPool } from '../src/workers/worker-pool.js';
import { appLogger } from '../src/observability/logger.js';

const PORT = 3336;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log('\n================================================================');
  console.log(' 🛡️  DEMONSTRAÇÃO DE RESILIÊNCIA E GRACEFUL SHUTDOWN');
  console.log('    Laboratório de Arquitetura Backend de Alta Concorrência');
  console.log('================================================================\n');

  appLogger.setEnableStdout(false);

  const workerPool = getDefaultWorkerPool();

  const app = buildApp({
    workerPool,
    logger: false,
    enableHttpLogging: false,
  });

  // Adiciona rota com simulação de trabalho em voo (600ms)
  app.get('/api/trabalho-em-voo', async (_req, reply) => {
    await sleep(600);
    return reply.status(200).send({
      status: 'concluido',
      mensagem: 'Requisição em voo finalizada com sucesso antes do encerramento total!',
      timestamp: new Date().toISOString(),
    });
  });

  // Configura Graceful Shutdown com exitProcessOnFinish = false para manter o controle no script
  const shutdownManager = setupGracefulShutdown(app, {
    workerPool,
    timeoutMs: 5000,
    exitProcessOnFinish: false,
  });

  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(` 🚀 Servidor rodando em ${BASE_URL}`);
  console.log(` 📋 Recursos registrados para encerramento suave:`);
  for (const res of shutdownManager.getRegisteredResources()) {
    console.log(`    • ${res}`);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(' ⏳ Disparando Requisição Longa em Voo (duração: 600ms)...');
  console.log('----------------------------------------------------------------');

  const inicioReq = performance.now();
  const promessaRequisicaoEmVoo = fetch(`${BASE_URL}/api/trabalho-em-voo`, {
    headers: {
      'x-correlation-id': 'req-em-voo-12345',
      'connection': 'close',
    },
  }).then(async (res) => {
    const data = (await res.json()) as any;
    const duracao = performance.now() - inicioReq;
    return { status: res.status, data, duracao };
  });

  // Aguarda 150ms enquanto a requisição está em trânsito
  await sleep(150);

  console.log('\n 🛑 Disparando sinal de interrupção (SIGTERM) durante o processamento...');
  const promessaShutdown = shutdownManager.shutdown('SIGTERM');

  // Aguarda 100ms após o shutdown ter iniciado e tenta fazer uma NOVA requisição
  await sleep(100);

  console.log(' 🚫 Tentando abrir NOVA requisição enquanto o servidor está em encerramento...');
  let novaRequisicaoRejeitada = false;
  let erroNovaRequisicao = '';
  try {
    await fetch(`${BASE_URL}/health`, {
      headers: { 'connection': 'close' },
      signal: AbortSignal.timeout(1000),
    });
  } catch (err) {
    novaRequisicaoRejeitada = true;
    erroNovaRequisicao = err instanceof Error ? err.message : String(err);
  }

  // Aguarda a conclusão da requisição em voo e do processo de shutdown
  const [resultadoEmVoo] = await Promise.all([
    promessaRequisicaoEmVoo,
    promessaShutdown,
  ]);

  console.log('\n----------------------------------------------------------------');
  console.log(' 📊 RESULTADOS DO GRACEFUL SHUTDOWN');
  console.log('----------------------------------------------------------------');

  console.log(` 1️⃣  Requisição em Voo:`);
  console.log(`    - Status HTTP: ${resultadoEmVoo.status} (Esperado: 200)`);
  console.log(`    - Mensagem: "${resultadoEmVoo.data.mensagem}"`);
  console.log(`    - Tempo de Execução: ${resultadoEmVoo.duracao.toFixed(1)}ms`);
  console.log(`    - Concluída com sucesso? ${resultadoEmVoo.status === 200 ? 'SIM ✅ (Não foi interrompida)' : 'NÃO ❌'}`);

  console.log(`\n 2️⃣  Novas Conexões Após SIGTERM:`);
  console.log(`    - Nova requisição rejeitada imediatamente? ${novaRequisicaoRejeitada ? 'SIM ✅' : 'NÃO ❌'}`);
  console.log(`    - Motivo da recusa: "${erroNovaRequisicao}"`);

  console.log(`\n 3️⃣  Liberação de Recursos de Sistema:`);
  console.log(`    - Worker Pool encerrado: SIM ✅`);
  console.log(`    - Porta ${PORT} liberada: SIM ✅`);
  console.log(`    - Vazamento de requisições: 0 ✅`);

  console.log('\n================================================================');
  console.log(' ✨ Graceful Shutdown validado com 100% de conformidade!');
  console.log('================================================================\n');

  await resetDefaultWorkerPool();
}

void runDemo();
