import { buildApp } from './app.js';
import { getDefaultWorkerPool } from './workers/worker-pool.js';
import { setupGracefulShutdown } from './shutdown/graceful-shutdown.js';
import { appLogger } from './observability/logger.js';

const PORT = Number(process.env['PORT'] ?? 3000);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const workerPool = getDefaultWorkerPool();

const app = buildApp({
  workerPool,
  enableHttpLogging: true,
});

// Configuração do Graceful Shutdown para tratamento de SIGINT e SIGTERM
setupGracefulShutdown(app, {
  workerPool,
  timeoutMs: 10000,
});

async function start() {
  try {
    const address = await app.listen({ port: PORT, host: HOST });
    appLogger.info(`🚀 Servidor iniciado com sucesso em ${address}`, {
      port: PORT,
      host: HOST,
      nodeVersion: process.version,
      pid: process.pid,
    });
  } catch (err) {
    appLogger.error('Falha crítica ao iniciar o servidor HTTP:', err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  }
}

void start();
