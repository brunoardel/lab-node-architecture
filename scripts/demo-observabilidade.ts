import { buildApp } from '../src/app.js';
import { appLogger } from '../src/observability/logger.js';
import { resetDefaultWorkerPool } from '../src/workers/worker-pool.js';

const PORT = 3335;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log('\n================================================================');
  console.log(' 🔍 DEMONSTRAÇÃO DE OBSERVABILIDADE & ASYNC LOCAL STORAGE');
  console.log('    Laboratório de Arquitetura Backend de Alta Concorrência');
  console.log('================================================================\n');

  // Ativa logs no stdout em formato estruturado
  appLogger.setEnableStdout(false); // Mantém console limpo para o relatório, exibindo logs filtrados

  const app = buildApp({
    logger: false,
    enableHttpLogging: false,
  });

  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(` Servidor de observabilidade ativo em ${BASE_URL}\n`);

  try {
    // -------------------------------------------------------------
    // CENÁRIO 1: Rastreabilidade Transparente Multi-camadas (UUID Automático)
    // -------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log(' 🌐 [CENÁRIO 1] Rastreamento Ponta a Ponta com UUID Gerado');
    console.log('    Requisição sem header x-correlation-id.');
    console.log('    Camadas: Controller -> Service -> Repository');
    console.log('----------------------------------------------------------------');

    const res1 = await fetch(`${BASE_URL}/api/observabilidade/rastreamento-camadas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Residencial Bela Vista',
        tipoZoneamento: 'Residencial',
        areaTerrenoM2: 600,
      }),
    });

    const data1 = (await res1.json()) as any;
    console.log(`\n ✅ Status HTTP: ${res1.status}`);
    console.log(` 🔑 Correlation ID Injetado: ${data1.correlationId}`);
    console.log(` 📦 Header 'x-correlation-id' na Resposta: ${res1.headers.get('x-correlation-id')}`);
    console.log(` 📑 Total de Logs Emitidos nas Camadas: ${data1.totalLogsRegistrados}`);
    console.log('\n    Trilha de Auditoria (Logs recuperados via AsyncLocalStorage):');
    for (const log of data1.logs) {
      console.log(`    ↳ [${log.level.toUpperCase()}] [${log.component}] ${log.message}`);
      console.log(`      • CorrelationId: ${log.correlationId} | Timestamp: ${log.timestamp}`);
    }

    // -------------------------------------------------------------
    // CENÁRIO 2: Rastreabilidade com Correlation ID Fornecido pelo Cliente
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log(' 🏷️  [CENÁRIO 2] Propagação de Correlation ID Fornecido pelo Cliente');
    console.log('    Header: x-correlation-id: gateway-edge-trace-98765');
    console.log('----------------------------------------------------------------');

    const customTraceId = 'gateway-edge-trace-98765';
    const res2 = await fetch(`${BASE_URL}/api/observabilidade/rastreamento-camadas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': customTraceId,
      },
      body: JSON.stringify({
        nome: 'Parque Industrial Alpha',
        tipoZoneamento: 'Industrial',
        areaTerrenoM2: 1500,
      }),
    });

    const data2 = (await res2.json()) as any;
    console.log(`\n ✅ Status HTTP: ${res2.status}`);
    console.log(` 🔑 Correlation ID Propagado: ${data2.correlationId}`);
    console.log(` 📦 Header Confirmado: ${res2.headers.get('x-correlation-id')}`);
    console.log(` 🛡️  Verificação de Integridade:`);
    const todosIguais = data2.logs.every((l: any) => l.correlationId === customTraceId);
    console.log(`    - Todos os logs das 3 camadas contêm '${customTraceId}': ${todosIguais ? 'SIM (100% íntegro)' : 'NÃO'}`);

    // -------------------------------------------------------------
    // CENÁRIO 3: Isolamento Assíncrono em Alta Concorrência
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log(' ⚡ [CENÁRIO 3] Isolamento em Execução Concorrente');
    console.log('    Disparando 3 requisições simultâneas com IDs distintos...');
    console.log('----------------------------------------------------------------');

    const promessasConcorrentes = [1, 2, 3].map(async (num) => {
      const id = `concorrente-job-${num}`;
      const res = await fetch(`${BASE_URL}/api/observabilidade/rastreamento-camadas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': id,
        },
        body: JSON.stringify({
          nome: `Projeto Concorrente ${num}`,
          tipoZoneamento: 'Comercial',
          areaTerrenoM2: 400 + num * 100,
        }),
      });
      const body = (await res.json()) as any;
      return { num, id, responseId: body.correlationId, headerId: res.headers.get('x-correlation-id') };
    });

    const resultadosConcorrentes = await Promise.all(promessasConcorrentes);
    for (const r of resultadosConcorrentes) {
      console.log(`    • Req ${r.num}: Enviado '${r.id}' ➔ Retornado '${r.responseId}' [Header: ${r.headerId}]`);
    }

    // -------------------------------------------------------------
    // CENÁRIO 4: Tratamento Centralizado de DomainError (HTTP 4xx)
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log(' ⚠️  [CENÁRIO 4] Interceptação Centralizada de DomainError (HTTP 400)');
    console.log('    Tentando cadastrar projeto com regra inválida...');
    console.log('----------------------------------------------------------------');

    const res4 = await fetch(`${BASE_URL}/api/observabilidade/simular-erro-dominio`, {
      headers: { 'x-correlation-id': 'trace-domain-err' },
    });
    const errData4 = (await res4.json()) as any;
    console.log(`\n 🔴 Status HTTP Retornado: ${res4.status} ${errData4.error}`);
    console.log(` 📌 Código do Erro: ${errData4.code}`);
    console.log(` 💬 Mensagem de Negócio: ${errData4.message}`);
    console.log(` 🔍 Detalhes Urbanísticos:`, errData4.detalhes);
    console.log(` 🔒 Stack Trace Vazou na Resposta? ${errData4.stack ? 'SIM (FALHA!)' : 'NÃO (Seguro)'}`);

    // -------------------------------------------------------------
    // CENÁRIO 5: Tratamento Centralizado de InfraError (HTTP 500 Sanitizado)
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log(' 🚨 [CENÁRIO 5] Interceptação de InfraError (HTTP 500 Sanitizado)');
    console.log('    Simulando falha de comunicação com Worker Thread...');
    console.log('----------------------------------------------------------------');

    const res5 = await fetch(`${BASE_URL}/api/observabilidade/simular-erro-infra`, {
      headers: { 'x-correlation-id': 'trace-infra-err' },
    });
    const errData5 = (await res5.json()) as any;
    console.log(`\n 🔴 Status HTTP Retornado: ${res5.status} ${errData5.error}`);
    console.log(` 📌 Código de Infraestrutura: ${errData5.code}`);
    console.log(` 💬 Mensagem Sanitizada: ${errData5.message}`);
    console.log(` 🔑 Correlation ID Preservado no Erro: ${errData5.correlationId}`);
    console.log(` 🔒 Stack Trace Vazou na Resposta? ${errData5.stack ? 'SIM (FALHA!)' : 'NÃO (Seguro)'}`);

    console.log('\n================================================================');
    console.log(' ✨ Demonstração de Observabilidade Concluída com Sucesso!');
    console.log('================================================================\n');
  } finally {
    await app.close();
    await resetDefaultWorkerPool();
  }
}

void runDemo();
