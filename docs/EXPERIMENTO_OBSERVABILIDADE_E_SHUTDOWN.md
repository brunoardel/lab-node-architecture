# Guia Arquitetural — Observabilidade com AsyncLocalStorage e Graceful Shutdown

> **Laboratório de Arquitetura Backend de Alta Concorrência em Node.js & TypeScript**  
> Referência Técnica das Implementações de **RF04 (Rastreabilidade Assíncrona)** e **RF05 (Resiliência e Ciclo de Vida)**

> 💡 **Infográfico Interativo no Navegador:** Experimente a rastreabilidade com AsyncLocalStorage, a matriz de erros Domain vs. Infra e a simulação de Graceful Shutdown ao vivo no arquivo [`docs/arquitetura-observabilidade-shutdown-interativa.html`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/arquitetura-observabilidade-shutdown-interativa.html).

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

## 2. Mapa Conceitual & Glossário Resumido dos Termos Fundamentais

Para compreender a fundo os mecanismos de observabilidade assíncrona, tratamento de erros e resiliência no ciclo de vida de aplicações Node.js, o glossário a seguir detalha os conceitos-chave, padrões e termos técnicos empregados nesta arquitetura:

### 2.1 Glossário Resumido dos Termos Fundamentais

- **AsyncLocalStorage (`node:async_hooks`)**: Classe nativa do Node.js que fornece armazenamento de variáveis com escopo de continuidade assíncrona (análogo ao *ThreadLocal* em ecossistemas multi-threaded como Java ou C#). Permite que dados de contexto (como `correlationId`, `tenantId`, dados de auditoria) sejam acessados em qualquer ponto da execução assíncrona (Promises, microtasks, timers, callbacks) sem a necessidade de repassar parâmetros manualmente entre funções.
- **Correlation ID (`requestId` / `traceId`)**: Identificador único (geralmente UUID v4) atribuído na borda da API ou propagado a partir do cabeçalho `x-correlation-id`. Acompanha a requisição por todas as camadas lógicas (Controller -> Service -> Repository) e em chamadas a serviços externos, permitindo correlacionar logs de uma mesma transação distribuída.
- **Prop Drilling (Context Drilling)**: Antipattern arquitetural caracterizado pelo repasse manual de objetos de contexto ou infraestrutura (como `req`, `request` ou `correlationId`) através de todas as camadas e métodos intermediários da aplicação, poluindo assinaturas puras de domínio e acoplando regras de negócio à camada de transporte HTTP.
- **Structured Logging (Logs Estruturados)**: Prática de emitir logs em formato padronizado e parseável por máquinas (como JSON com campos `timestamp`, `level`, `message`, `correlationId`, `component` e `metadata`), facilitando indexação, busca, filtragem e agregação de telemetria em ferramentas de observabilidade (ex: Datadog, ELK Stack, Grafana Loki, CloudWatch).
- **DomainError (Erro de Domínio)**: Exceção operacional esperada que reflete uma violação de regras de negócio, dados inconsistentes ou parâmetros inválidos fornecidos pelo cliente (HTTP 4xx: 400, 404, 409, 422). Deve retornar ao cliente HTTP códigos de erro e descrições claras e acionáveis, pois trata-se de um erro tratável pelo consumidor da API.
- **InfraError (Erro de Infraestrutura)**: Exceção de sistema que decorre de indisponibilidade ou falha em componentes técnicos (Worker Threads, sistema de arquivos, banco de dados, rede ou dependências externas — HTTP 5xx: 500, 502, 504). Deve ser estritamente sanitizada antes de ser enviada ao cliente externo, mas gravada com stack trace completo no log interno para fins de depuração.
- **Stack Trace Leaking (Vazamento de Stack Trace)**: Vulnerabilidade de segurança e falha de design em que detalhes internos do runtime, caminhos absolutos de arquivos, números de linha e versões de bibliotecas (`error.stack`) são expostos na resposta JSON ao cliente HTTP, fornecendo vetores de ataque para agentes maliciosos.
- **Graceful Shutdown (Encerramento Suave / Gracioso)**: Procedimento controlado de término do processo no qual a aplicação para de aceitar novas requisições de rede, drena e conclui requisições em trânsito (*in-flight*), libera recursos abertos (Worker Threads, conexões de banco de dados, descritores de arquivo) e finaliza com código de saída 0.
- **In-Flight Requests (Requisições em Voo / em Trânsito)**: Requisições HTTP que já foram aceitas e estão sendo ativamente processadas pelo servidor no momento em que um sinal de encerramento (`SIGTERM`/`SIGINT`) é disparado. O Graceful Shutdown garante que essas requisições continuem até responderem com sucesso (HTTP 200), evitando respostas de erro 502 Bad Gateway no cliente.
- **Sinais POSIX (`SIGTERM` e `SIGINT`)**: Notificações assíncronas do sistema operacional enviadas ao processo. O `SIGTERM` (Signal 15) é o sinal padrão emitido por orquestradores (Kubernetes, ECS, Docker) para solicitar o desligamento ordenado de um container; o `SIGINT` (Signal 2) é tipicamente gerado ao pressionar `Ctrl+C` no terminal.
- **`SIGKILL` (Signal 9)**: Sinal forçado do sistema operacional que extermina o processo imediatamente sem possibilidade de interceptação, captura de eventos ou execução de rotinas de limpeza. É disparado pelo orquestrador quando o tempo limite de carência (*terminationGracePeriodSeconds*) expira.
- **`closeIdleConnections()`**: Método nativo do `http.Server` do Node.js (introduzido no Node.js v18.2+) que encerra imediatamente conexões persistentes (*Keep-Alive*) que estejam sem requisições ativas em processamento, evitando que conexões abertas em espera retenham o encerramento do servidor no `app.close()`.
- **Watchdog Timeout (Timeout de Contingência)**: Mecanismo de tolerância máxima (ex: 10 segundos) configurado no gerenciador de encerramento. Se algum recurso travar ou demorar além do limite, o watchdog força a saída imediata com `process.exit(1)`, impedindo a existência de processos zumbis consumindo memória e CPU no host.
- **Zod Validation na Borda (Edge Validation)**: Técnica arquitetural de validar e sanitizar payloads HTTP nos pontos de entrada da API (rotas/controllers) com schemas estritos (`z.infer`), impedindo que dados malformados alcancem os serviços de domínio e gerando respostas HTTP 400 padronizadas com a lista de inconsistências.
- **Fastify Plugin Encapsulation & `skip-override`**: Modelo de escopo hierárquico do Fastify no qual plugins criam contextos isolados por padrão. O uso de `Symbol.for('skip-override') = true` (padrão do `fastify-plugin`) instrui o framework a não isolar o plugin, permitindo que hooks globais (como `onRequest` com `AsyncLocalStorage`) e o `errorHandler` operem sobre toda a árvore de rotas da aplicação.
- **Audit Trail (Trilha de Auditoria)**: Histórico cronológico e contextualizado de operações realizadas pelo sistema em cada camada (Controller -> Service -> Repository), com data/hora, nível de severidade e o `correlationId` para permitir reprodução e rastreamento completo de eventos de negócio.

---

## 3. Rastreabilidade com `AsyncLocalStorage` (RF04)

### 3.1. O que é e Como Funciona o `AsyncLocalStorage`?

O módulo nativo `node:async_hooks` disponibiliza a classe `AsyncLocalStorage<T>`, que cria uma variável global de escopo assíncrono.

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

### 3.2. Implementação do `CorrelationContext` e `StructuredLogger`

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

### 3.3. Demonstração Prática: Controller -> Service -> Repository

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

## 4. Resiliência: Tratamento Centralizado de Erros (RF05)

### 4.1. Diferenciação Ontológica: `DomainError` vs. `InfraError`

Um dos maiores erros de segurança e engenharia em APIs backend é misturar falhas de validação de regras de negócio com falhas de infraestrutura, ou pior: expor `error.stack` para clientes HTTP.

| Critério | Erro de Domínio (`DomainError`) | Erro de Infraestrutura (`InfraError`) |
| :--- | :--- | :--- |
| **Status HTTP** | `400 Bad Request`, `404 Not Found`, `409 Conflict`, `422 Unprocessable` | `500 Internal Server Error`, `502 Bad Gateway`, `504 Gateway Timeout` |
| **Origem** | Regra de negócio violada, parâmetro inválido, recurso inexistente. | Queda de Worker, timeout de banco, filesystem inacessível, falta de memória. |
| **Natureza** | **Esperado e Operacional:** O cliente pode corrigir o payload e tentar novamente. | **Inesperado/Infra:** O cliente não pode resolver por conta própria; requer atenção da engenharia. |
| **Exposição ao Cliente** | Detalhado: código do erro (`code`), mensagem descritiva e detalhes de negócio. | **Estritamente Sanitizado:** Mensagem genérica segura. Zero detalhes de hardware ou banco. |
| **Stack Trace** | Desnecessário registrar com severidade alta. | **Obrigatório registrar internamente** no StructuredLogger com `correlationId`. **NUNCA exposto na resposta HTTP.** |

### 4.2. Hierarquia de Classes Tipadas

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

### 4.3. Plugin Centralizado de Erros

No arquivo [`src/errors/error-handler.plugin.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/errors/error-handler.plugin.ts), o Fastify captura todas as exceções síncronas e rejeições de Promises de forma centralizada:

1. Injeta `x-correlation-id` no cabeçalho HTTP de resposta mesmo em caso de falha crítica.
2. Formata payloads JSON padronizados com `statusCode`, `code`, `message`, `correlationId` e `timestamp`.
3. Garante que `stack` nunca seja incluído na resposta JSON para o cliente externo.

---

## 5. Graceful Shutdown & Resiliência (RF05)

### 5.1. O Ciclo de Vida de um Desligamento Gracioso

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

### 5.2. Gotcha Crítico do Node.js: Conexões Keep-Alive Ociosas

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

## 6. Como Executar e Demonstrar os Experimentos

### 6.1. Execução de Testes Automatizados

O laboratório conta com suíte completa de testes no Vitest cobrindo todos os cenários da Tarefa 5:

```bash
# Executa todos os 78 testes do projeto
npm test

# Executa apenas os testes da Tarefa 5
npx vitest run test/correlation-context.test.ts test/logger.test.ts test/error-handler.test.ts test/observabilidade.routes.test.ts test/graceful-shutdown.test.ts
```

### 6.2. Demonstração Interativa de Observabilidade

Para visualizar em tempo real a propagação do `correlationId` entre as camadas e o tratamento centralizado de erros:

```bash
npm run demo:observabilidade
```

### 6.3. Demonstração Interativa de Graceful Shutdown

Para testar a drenagem de requisições em voo com disparo de `SIGTERM` concorrente:

```bash
npm run demo:shutdown
```

O script comprova que:
1. Uma requisição de 600ms em trânsito termina com `HTTP 200` com sucesso total.
2. Novas tentativas de conexão disparadas após o sinal são rejeitadas imediatamente.
3. O Worker Pool e o servidor HTTP encerram de forma limpa e o processo finaliza com código 0.
