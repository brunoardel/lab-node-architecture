# Guia Arquitetural — Observabilidade com AsyncLocalStorage e Graceful Shutdown

> **Laboratório de Arquitetura Backend de Alta Concorrência em Node.js & TypeScript**  
> Referência Técnica das Implementações de **RF04 (Rastreabilidade Assíncrona)** e **RF05 (Resiliência e Ciclo de Vida)**

---

## 1. Visão Geral e Desafios de Engenharia

Em arquiteturas de backend modernas de alta concorrência baseadas no Event Loop do Node.js, dois problemas críticos frequentemente comprometem a confiabilidade e a manutenibilidade de microsserviços e monólitos modulares:

1. **Perda de Contexto Assíncrono (Trace Loss):**  
   Como o Node.js multiplexa centenas de requisições concorrentes em uma única thread principal através de filas de callbacks, micro-tarefas e macro-tarefas, rastrear quais linhas de log pertencem a qual requisição de usuário torna-se um pesadelo se o identificador (`correlationId` / `requestId`) não for propagado por toda a pilha.  
   A abordagem ingênua de repassar o objeto `req` ou `correlationId` como parâmetro em todos os métodos de Controllers, Services e Repositories (conhecida como *Context/Prop Drilling*) polui as assinaturas de domínio, quebra abstrações arquiteturais limpas e viola o princípio de responsabilidade única.

2. **Terminação Abrupta em Ambientes Cloud Native (Hard Kills):**  
   Em clusters Kubernetes, AWS ECS ou Docker, quando um pod ou contêiner é escalado para baixo ou atualizado (Rolling Update), o orquestrador envia um sinal `SIGTERM`. Se o processo Node.js simplesmente encerrar imediatamente ou se o orquestrador matá-lo por timeout (`SIGKILL`), requisições em trânsito são abortadas com `502 Bad Gateway`, transações financeiras e cálculos geométricos ficam corrompidos na metade, e Worker Threads permanecem como processos zumbis consumindo recursos de CPU.

Este módulo implementa soluções elegantes e robustas para ambos os desafios utilizando as APIs nativas mais modernas do Node.js.

---

## 2. Rastreabilidade com `AsyncLocalStorage` (RF04)

### 2.1. O que é e Como Funciona o `AsyncLocalStorage`?

O módulo nativo `node:async_hooks` disponibiliza a classe `AsyncLocalStorage<T>`, que cria uma variável global de escopo assíncrono (análoga ao *ThreadLocal* em ecossistemas multi-threaded como Java ou C#, mas adaptada à natureza orientada a eventos do Node.js).

```
[Requisição HTTP Entra] 
         │
         ▼
[onRequest Hook] ──> Gera/Lê x-correlation-id ──> correlationStorage.run(context, () => {
         │                                              │
         ├─── Controller (appLogger.info)  ◄────────────┤ Recupera correlationId
         │         │                                    │ automaticamente do ALS
         ├─── Service    (appLogger.info)  ◄────────────┤ sem receber 'req'
         │         │                                    │ como parâmetro!
         └─── Repository (appLogger.info)  ◄────────────┘
```

A cada salto no Event Loop — seja através de `await`, resolução de Promises, `process.nextTick` ou temporizadores — o Node.js preserva a referência ao armazenamento assíncrono correspondente à cadeia causal daquela execução específica.

### 2.2. Implementação do `CorrelationContext` e `StructuredLogger`

No arquivo [`src/observability/correlation-context.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/observability/correlation-context.ts):

```typescript
export interface CorrelationContext {
  readonly correlationId: string;
  readonly requestId: string;
  readonly startTime: number;
  readonly parentCorrelationId?: string;
  readonly method?: string;
  readonly path?: string;
  readonly metadata?: Record<string, unknown>;
}

export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function getCorrelationId(fallback?: string): string | undefined {
  return correlationStorage.getStore()?.correlationId ?? fallback;
}
```

No arquivo [`src/observability/logger.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/observability/logger.ts), o `StructuredLogger` injeta o identificador em cada entrada de log:

```typescript
const context = getCorrelationContext();
const correlationId = context?.correlationId ?? getCorrelationId();

const entry: LogEntry = {
  timestamp: new Date().toISOString(),
  level,
  message,
  ...(correlationId ? { correlationId } : {}),
  ...(this.component ? { component: this.component } : {}),
  ...(metadata ? { metadata } : {}),
};
```

### 2.3. Demonstração Prática: Controller -> Service -> Repository

Observe como a camada de repositório [`src/repository/projeto.repository.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/repository/projeto.repository.ts) realiza auditoria sem poluição de parâmetros:

```typescript
// Assinatura de domínio 100% pura: não recebe req, request ou reqId!
public async salvar(projeto: ProjetoRegistro): Promise<ProjetoRegistro> {
  logger.info(`Iniciando persistência do projeto: ${projeto.nome}`, {
    projetoId: projeto.id,
    camada: 'Repository',
  });
  // O log emitido terá correlationId automaticamente!
}
```

---

## 3. Resiliência: Tratamento Centralizado de Erros (RF05)

### 3.1. Diferenciação Ontológica: `DomainError` vs. `InfraError`

Um dos maiores erros de segurança e engenharia em APIs backend é misturar falhas de validação de regras de negócio com falhas de infraestrutura, ou pior: expor `error.stack` para clientes HTTP.

| Critério | Erro de Domínio (`DomainError`) | Erro de Infraestrutura (`InfraError`) |
| :--- | :--- | :--- |
| **Status HTTP** | `400 Bad Request`, `404 Not Found`, `409 Conflict`, `422 Unprocessable` | `500 Internal Server Error`, `502 Bad Gateway`, `504 Gateway Timeout` |
| **Origem** | Regra de negócio violada, parâmetro inválido, recurso inexistente. | Queda de Worker, timeout de banco, filesystem inacessível, falta de memória. |
| **Natureza** | **Esperado e Operacional:** O cliente pode corrigir o payload e tentar novamente. | **Inesperado/Infra:** O cliente não pode resolver por conta própria; requer atenção da engenharia. |
| **Exposição ao Cliente** | Detalhado: código do erro (`code`), mensagem descritiva e detalhes de negócio. | **Estritamente Sanitizado:** Mensagem genérica segura. Zero detalhes de hardware ou banco. |
| **Stack Trace** | Desnecessário registrar com severidade alta. | **Obrigatório registrar internamente** no StructuredLogger com `correlationId`. **NUNCA exposto na resposta HTTP.** |

### 3.2. Hierarquia de Classes Tipadas

Definida em [`src/errors/app-error.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/errors/app-error.ts):

- `AppError` (Base Abstrata com `isOperational = true`)
  - `DomainError` (HTTP 4xx)
    - `RegraInvalidaError` (HTTP 400 - ex: recuo mínimo desrespeitado)
    - `ParametroInvalidoError` (HTTP 400 - dados inconsistentes)
    - `ZoneamentoNaoSuportadoError` (HTTP 422 - tipo desconhecido)
    - `ProjetoNaoEncontradoError` (HTTP 404 - recurso ausente)
    - `ConflitoRegraError` (HTTP 409 - sobreposição de leis)
  - `InfraError` (HTTP 5xx)
    - `WorkerPoolFalhaError` (HTTP 500 - Worker Thread falhou)
    - `ArquivoInacessivelError` (HTTP 500 - erro de disco/IO)
    - `TimeoutProcessamentoError` (HTTP 504 - limite de tempo excedido)

### 3.3. Plugin Centralizado de Erros

No arquivo [`src/errors/error-handler.plugin.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/errors/error-handler.plugin.ts), o Fastify captura todas as exceções síncronas e rejeições de Promises de forma centralizada:

1. Injeta `x-correlation-id` no cabeçalho HTTP de resposta mesmo em caso de falha crítica.
2. Formata payloads JSON padronizados com `statusCode`, `code`, `message`, `correlationId` e `timestamp`.
3. Garante que `stack` nunca seja incluído na resposta JSON para o cliente externo.

---

## 4. Graceful Shutdown & Resiliência (RF05)

### 4.1. O Ciclo de Vida de um Desligamento Gracioso

Quando o orquestrador emite `SIGTERM` ou o operador pressiona `Ctrl+C` (`SIGINT`), o [`GracefulShutdownManager`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/shutdown/graceful-shutdown.ts) assume o controle do processo:

```
[Sinal SIGTERM/SIGINT Recebido]
                │
                ▼
      [Ativa Watchdog Timeout] (ex: 10.000ms limite forçado)
                │
                ▼
   [Prioridade 10: Fastify Server]
   ├── Interrompe o recebimento de NOVAS conexões HTTP (server.close)
   ├── Encerra imediatamente conexões ociosas (closeIdleConnections)
   └── Aguarda conclusão das requisições ATIVAS em trânsito (in-flight)
                │
                ▼
   [Prioridade 20: Worker Pool]
   └── Termina threads secundárias do node:worker_threads (workerPool.terminate)
                │
                ▼
   [Prioridade 50: Flush & Cleanup]
   └── Limpa listeners e encerra processo com exit code 0
```

### 4.2. Gotcha Crítico do Node.js: Conexões Keep-Alive Ociosas

Nos servidores HTTP nativos do Node.js e no Fastify, chamar `app.close()` para de aceitar novos sockets TCP, mas aguarda o encerramento de todas as conexões existentes. Clientes HTTP modernos (como `fetch`, navegadores e proxies reversos) mantêm conexões persistentes (*Keep-Alive*) abertas na expectativa de novas chamadas.

Se conexões ociosas não forem fechadas explicitamente, o servidor aguardará o timeout do Keep-Alive (que pode durar de 5 a 60 segundos), travando o encerramento do processo.

Para solucionar isso de forma definitiva, implementamos:

```typescript
if (typeof (app.server as any)?.closeIdleConnections === 'function') {
  (app.server as any).closeIdleConnections();
}
await app.close();
```

Isso garante que:
- Requisições que estão ativamente processando dados continuem executando até o fim e recebam seu `HTTP 200 OK`.
- Sockets vazios em espera sejam imediatamente liberados.

---

## 5. Como Executar e Demonstrar os Experimentos

### 5.1. Execução de Testes Automatizados

O laboratório conta com suíte completa de testes no Vitest cobrindo todos os cenários da Tarefa 5:

```bash
# Executa todos os 78 testes do projeto
npm test

# Executa apenas os testes da Tarefa 5
npx vitest run test/correlation-context.test.ts test/logger.test.ts test/error-handler.test.ts test/observabilidade.routes.test.ts test/graceful-shutdown.test.ts
```

### 5.2. Demonstração Interativa de Observabilidade

Para visualizar em tempo real a propagação do `correlationId` entre as camadas e o tratamento centralizado de erros:

```bash
npm run demo:observabilidade
```

### 5.3. Demonstração Interativa de Graceful Shutdown

Para testar a drenagem de requisições em voo com disparo de `SIGTERM` concorrente:

```bash
npm run demo:shutdown
```

O script comprova que:
1. Uma requisição de 600ms em trânsito termina com `HTTP 200` com sucesso total.
2. Novas tentativas de conexão disparadas após o sinal são rejeitadas imediatamente.
3. O Worker Pool e o servidor HTTP encerram de forma limpa e o processo finaliza com código 0.
