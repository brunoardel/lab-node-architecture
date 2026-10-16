# Tarefas de Implementação — Projeto 3 (Backend Node.js & TypeScript)

- [ ] **Tarefa 1: Setup da Aplicação e Servidor Base**
  - Inicializar projeto Node.js com TypeScript, `tsx`/`ts-node` e framework web (Fastify ou Express).
  - Configurar `tsconfig.json` com `strict: true` e `noUncheckedIndexedAccess: true`.
  - Configurar Vitest para testes automatizados.

- [ ] **Tarefa 2: Modelagem de Domínio com Discriminated Unions e Zod**
  - Criar contratos de domínio urbanístico com Discriminated Unions e Branded Types.
  - Implementar o serviço de cálculo com checagem exaustiva (`never`).
  - Implementar validação na rota com schema Zod e testes unitários no Vitest comprovando a quebra em tipos inválidos.

- [ ] **Tarefa 3: O Experimento do Event Loop (Thread Bloqueante vs. Worker Threads)**
  - Criar função de cálculo matemático pesado.
  - Criar rota `/bloqueante` e demonstrar como ela trava requisições de saúde (`/health`).
  - Implementar worker pool com `worker_threads` na rota `/otimizada` e demonstrar `/health` respondendo instantaneamente em paralelo.

- [ ] **Tarefa 4: O Experimento de Memória (Buffer vs. Streams com Backpressure)**
  - Criar gerador de arquivo massivo de teste (50MB+).
  - Implementar rota de processamento via Buffer registrando o pico de memória (`process.memoryUsage().rss`).
  - Implementar rota de processamento via `stream.pipeline` e `Transform` stream, registrando o consumo estável de RAM.

- [ ] **Tarefa 5: Observabilidade com AsyncLocalStorage e Graceful Shutdown**
  - Implementar middleware com `AsyncLocalStorage` para injeção e leitura de `correlationId`.
  - Implementar middleware de erro centralizado e tratamento de sinais `SIGTERM`/`SIGINT`.
