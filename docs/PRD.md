# PRD — Projeto 3: Arquitetura Backend de Alta Concorrência (Node.js & TypeScript)

## 1. Visão Geral

Construir uma API backend em Node.js e TypeScript simulando o motor de cálculos e ingestão de arquivos da ArqLab. O objetivo é demonstrar na prática soluções arquiteturais para os maiores desafios de backend moderno: concorrência de CPU em ambiente single-threaded, manipulação de arquivos pesados com baixo consumo de memória RAM, observabilidade assíncrona, resiliência no ciclo de vida e modelagem estrita de domínio.

## 2. Escopo e Requisitos Funcionais

### RF01: Modelagem de Domínio Estrita e Validação de Borda

- **Modelagem com Discriminated Unions:** Modelar regras de zoneamento urbanístico (`Residencial`, `Comercial`, `Industrial`) com propriedades específicas para cada uma, utilizando um campo discriminador `tipo`.
- **Checagem Exaustiva:** Implementar um motor de cálculo de potencial construtivo com `switch (regra.tipo)` utilizando o tipo `never` no bloco `default`, garantindo em tempo de compilação que novas regras adicionadas ao union obriguem a implementação do cálculo correspondente.
- **Validação com Zod:** Sanitização e validação dos payloads HTTP na borda, inferindo tipos com `z.infer`.
- **Branded Types:** Uso de tipos nominais para evitar confusão entre `ProjetoId` e `UsuarioId`, ou entre metros quadrados e metros lineares.

### RF02: Concorrência e Offloading de Tarefas Intensivas de CPU

- Simulação de cálculo pesado de volumetria geométrica e terraplenagem (laço intensivo de CPU que leva de 2 a 3 segundos).
- **Cenário A (Bloqueante):** Endpoint síncrono que executa o cálculo diretamente na thread principal, demonstrando o congelamento do Event Loop e a recusa/lentidão de outras requisições concorrentes de I/O.
- **Cenário B (Worker Threads):** Refatoração do cálculo utilizando o módulo nativo `node:worker_threads`, processando o cálculo em uma thread do sistema operacional e mantendo a API responsiva para requisições concorrentes.

### RF03: Manipulação de Arquivos Pesados e Controle de Memória (Streams vs. Buffers)

- Endpoint para processamento e parsing de dados espaciais/arquivos pesados (simulação de 50MB a 100MB).
- **Cenário A (Buffer ingênuo):** Leitura com `fs.readFile`, demonstrando pico abrupto de uso de memória RAM no processo do Node.js.
- **Cenário B (Streams e Backpressure):** Leitura, transformação e escrita utilizando `stream.pipeline` com `Transform` stream em chunks de 64KB, mantendo o consumo de memória estável e constante (na casa dos megabytes).

### RF04: Rastreabilidade com AsyncLocalStorage (Correlation ID)

- Middleware que gera um `requestId` único por requisição HTTP e inicia um contexto assíncrono via `AsyncLocalStorage`.
- Logger estruturado que recupera e imprime o `requestId` em logs de controllers, services e repositories sem que o objeto `req` seja repassado como parâmetro.

### RF05: Resiliência e Graceful Shutdown

- Middleware de tratamento centralizado de erros diferenciando `DomainError` (HTTP 4xx) de `InfraError` (HTTP 500) sem vazar stack traces.
- Encerramento suave tratando sinais `SIGTERM` e `SIGINT`: interrupção do recebimento de novas conexões, finalização das requisições em voo e fechamento seguro de recursos.

## 3. Requisitos Não Funcionais

- **Stack:** Node.js (v18+), TypeScript (strict mode ativado), Fastify ou Express, Zod, Vitest para testes unitários.
- **Métricas:** Scripts de teste de carga simples ou logs medindo tempo de resposta e consumo de memória (`process.memoryUsage()`).
