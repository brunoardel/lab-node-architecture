# Anotações e Lições Aprendidas — Tarefa 3: O Experimento do Event Loop

Este documento consolida o resumo das discussões técnicas, conceitos fundamentais e aprendizados práticos desenvolvidos durante a execução e aprofundamento da **Tarefa 3: O Experimento do Event Loop (Thread Bloqueante vs. Worker Threads)** no projeto `lab-node-architecture`.

---

## 🧭 1. Resumo da Jornada de Exploração

1. **Mapeamento Conceitual:** Identificamos e sintetizamos as 16 palavras-chave essenciais do runtime do Node.js, detalhando o papel arquitetural de cada uma e seu impacto direto em ambientes de produção.
2. **Diagrama Estilo Excalidraw:** Desenhamos a arquitetura do processo Node.js em formato vetorial com estilo *whiteboard* manual no arquivo [`docs/assets/node-architecture-excalidraw.svg`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/assets/node-architecture-excalidraw.svg) e integramos o glossário na Seção 2 do documento principal [`docs/EXPERIMENTO_EVENT_LOOP.md`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/EXPERIMENTO_EVENT_LOOP.md).
3. **Exploração Declarativa com Mermaid:** Criamos o documento dedicado [`docs/ARQUITETURA_NODE_MERMAID.md`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/ARQUITETURA_NODE_MERMAID.md), contendo o diagrama de arquitetura em blocos, o diagrama de sequência temporal das rotas (`/bloqueante` vs. `/otimizada`) e a máquina de estados das fases do Event Loop.
4. **Avaliação Crítica de Ferramentas Visuais:** Analisamos as limitações práticas de layout rígido do Mermaid e levantamos as melhores alternativas modernas de diagramação da indústria (Excalidraw Nativo, D2 Lang, Draw.io, Infográfico Interativo e Ilustração Digital).
5. **Criação do Infográfico / Laboratório Interativo (HTML + CSS + JS):** Desenvolvemos o aplicativo independente [`docs/arquitetura-node-interativa.html`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/arquitetura-node-interativa.html), equipado com:
   - Painel de telemetria em tempo real (Event Loop Lag, estado da Call Stack, K8s Probe e WorkerPool).
   - Simulação interativa passo a passo com transições visuais de **pacotes voadores (*flying packets*)** trafegando entre a Main Thread, a Call Stack, a libuv e os Workers.
   - Animações em ritmo didático com seletor de velocidade (🐢 Lenta / ⚡ Média / 🐇 Rápida).
   - Botões interativos para inspeção das 4 fases do Event Loop (`Microtasks`, `Timers`, `Poll`, `Check`).
   - Explorador de palavras-chave com destaque visual dinâmico (*glow/pulse*) no componente arquitetural correspondente.

---

## 🧠 2. O Que Aprendemos: Conceitos e Fundamentos Técnicos

### 2.1 Arquitetura do Runtime Node.js
- **Execução JavaScript Single-Threaded:** O código JS do desenvolvedor executa em uma única thread principal sob uma instância isolada do motor **Google V8** (*V8 Isolate*).
- **I/O Multi-Threaded Assíncrono:** Operações de rede (sockets TCP/HTTP) e disco são delegadas para o Kernel do Sistema Operacional (epoll, kqueue, IOCP) e para a threadpool interna em C/C++ da **libuv** (4 threads por padrão).
- **A Regra da Call Stack:** O Event Loop **nunca** avança enquanto houver qualquer função síncrona sendo processada na Call Stack. A pilha tem prioridade absoluta.
- **As Fases do Ciclo do Event Loop:**
  1. **Microtasks Queue** (`process.nextTick`, `Promise.then`): Prioridade máxima; a fila é esvaziada integralmente antes de qualquer transição de fase.
  2. **Timers Phase:** Executa callbacks de `setTimeout()` e `setInterval()` cujos prazos já expiraram.
  3. **Pending Callbacks:** Trata callbacks de I/O adiados pelo sistema operacional.
  4. **Poll Phase (I/O):** Recupera novos eventos de rede e leitura de arquivos. Fica bloqueada aguardando conexões caso não haja outras tarefas pendentes.
  5. **Check Phase (`setImmediate`):** Executa callbacks agendados para rodar logo após o I/O, ideal para fatiamento de código longo.
  6. **Close Callbacks:** Executa eventos de fechamento de conexões (`socket.on('close')`).

---

### 2.2 O Problema Real: CPU-Bound vs. I/O-Bound
- **Cenário I/O-Bound (O Ponto Forte do Node):** Consultas a bancos de dados, leitura de APIs externas e streaming de arquivos não bloqueiam a CPU. A thread principal apenas dispara a chamada e registra o callback.
- **Cenário CPU-Bound (O Ponto Crítico):** Cálculos matemáticos contínuos (como a volumetria de corte/aterro de terraplenagem da ArqLab, criptografia pesada, renderização gráfica ou compressão) consom 100% de um núcleo de CPU na Main Thread.
- **Event Loop Lag e Queda em Cascata:**
  - O Event Loop congela (*Event Loop Lag* infinito durante o cálculo).
  - O servidor para de responder a requisições HTTP triviais.
  - As verificações de saúde (`GET /health`) enviadas pelo Kubernetes ou Nginx ficam represadas no buffer TCP do SO sem serem aceitas (`socket.accept()`).
  - O orquestrador assume que o container travou e mata o pod (*pod eviction*), provocando indisponibilidade para todos os clientes da plataforma.

---

### 2.3 Soluções de Engenharia para Concorrência de CPU

| Abordagem | Consumo de CPU | Bloqueia Event Loop? | Complexidade | Recomendação Arquitetural |
| :--- | :--- | :--- | :--- | :--- |
| **A. Cálculo Direto na Main Thread** | 1 core a 100% | **SIM (Congelamento Total)** | Muito baixa | ❌ **Inaceitável em Produção** para tarefas $> 50\text{ms}$. |
| **B. Chunking com `setImmediate`** | 1 core fracionado | **Não**, mas degrada latência | Média | ⚠️ Apenas para tarefas leves divisíveis. |
| **C. `node:worker_threads` com Pool** | N cores paralelos | **NÃO (Thread Isolada)** | Alta | ✅ **Padrão ouro** para tarefas pesadas no mesmo serviço. |
| **D. Processos Filhos (`child_process.fork`)** | Isolamento total de SO | **NÃO** | Alta | ⚠️ Maior consumo de memória RAM por processo duplicado (~30MB+). |
| **E. Fila Assíncrona & Worker Dedicado** | Escalabilidade horizontal | **NÃO** | Muito Alta | ✅ Ideal para jobs que duram minutos/horas (ex: RabbitMQ/BullMQ). |

---

### 2.4 Boas Práticas do Padrão `WorkerPool`
1. **Evitar Instanciar Workers Sob Demanda:** Criar um novo *V8 Isolate* consome de 50ms a 150ms e dezenas de megabytes de RAM. O pool mantém threads pré-aquecidas prontas para uso.
2. **Dimensionamento Correto:** Usar `os.availableParallelism()` para definir o tamanho do pool respeitando limites de cgroups em containers Docker/Kubernetes, evitando perda de performance por troca de contexto excessiva (*Context Switching*).
3. **Mecanismo de Auto-Recuperação (*Self-Healing*):** Se um worker sofrer um erro fatal não tratado ou encerrar inesperadamente (`exit`), o pool descarta a thread corrompida e instancia uma nova saudável no lugar.
4. **Comunicação Eficiente:**
   - Para payloads moderados: `postMessage()` com *Structured Clone* (cópia serializada segura).
   - Para volumes gigantescos de dados (> 100MB): *Transferable Objects* (`ArrayBuffer`) ou `SharedArrayBuffer` para troca de dados sem custo de cópia de bytes (*Zero-Copy*).

---

## 📊 3. Métricas Comprovadas no Laboratório

Durante os benchmarks do projeto, a comparação empírica entre as rotas comprovou:

- **Rota Bloqueante (`/bloqueante`):**
  - Tempo de execução do cálculo: **~2.152 ms** (na Main Thread).
  - Latência das requisições de `/health` durante o cálculo: **~2.136 ms** (represadas no buffer TCP).
  - Diagnóstico: **Starvation de I/O severo**.
- **Rota Otimizada com WorkerPool (`/otimizada`):**
  - Tempo de execução do cálculo: executado em paralelo na Worker Thread #2.
  - Latência das requisições concorrentes de `/health`: **6.9 ms** (atendimento instantâneo).
  - Diagnóstico: **Event Loop 100% livre e alto throughput mantido**.

---

## 🎨 4. Lições sobre Comunicação Visual e Documentação Técnica

- **Mermaid:** Prático para ser lido diretamente no GitHub, mas tem limitações de controle de layout, cruzamento confuso de linhas em fluxos densos e ausência de dinamismo temporal.
- **Excalidraw:** Excelente para engajamento e clareza conceitual em documentações estáticas, graças ao estilo informal e intuitivo de desenho à mão.
- **Infográficos Interativos em HTML/CSS/JS:**
  - O formato mais pedagógico para demonstrar concorrência e comportamento de threads.
  - A possibilidade de ver uma requisição viajando fisicamente como um **pacote voador** saindo da rota, entrando na pilha, sendo despachada para o worker e retornando transforma conceitos abstratos em modelos mentais tangíveis.
  - Medidores de telemetria em tempo real ajudam a visualizar instantaneamente a diferença entre uma API saudável e uma API degradada.

---

## 🔗 5. Catálogo de Arquivos e Artefatos da Tarefa 3

- **Código-Fonte:**
  - [`src/workers/worker-pool.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/workers/worker-pool.ts) — Implementação resiliente do Pool de Worker Threads.
  - [`src/workers/volumetria.worker.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/workers/volumetria.worker.ts) — Script executado isoladamente na worker thread.
  - [`src/services/volumetria.service.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/services/volumetria.service.ts) — Algoritmo de cálculo matemático pesado de terraplenagem.
  - [`src/routes/concorrencia.routes.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/src/routes/concorrencia.routes.ts) — Rotas `/bloqueante` e `/otimizada`.
  - [`test/event-loop-experiment.test.ts`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/test/event-loop-experiment.test.ts) — Testes automatizados de validação de latência com Vitest.
- **Documentação e Recursos Visuais:**
  - [`docs/EXPERIMENTO_EVENT_LOOP.md`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/EXPERIMENTO_EVENT_LOOP.md) — Guia prático arquitetural completo com a Seção 2 (Glossário e Mapa Mental).
  - [`docs/assets/node-architecture-excalidraw.svg`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/assets/node-architecture-excalidraw.svg) — Diagrama vetorial desenhado no estilo Excalidraw.
  - [`docs/ARQUITETURA_NODE_MERMAID.md`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/ARQUITETURA_NODE_MERMAID.md) — Diagramas arquiteturais, de fluxo temporal e fases em Mermaid.
  - [`docs/arquitetura-node-interativa.html`](file:///c:/Users/Bruno/Documents/Projetos/labs/lab-node-architecture/docs/arquitetura-node-interativa.html) — Simulador interativo da arquitetura com telemetria, transições visuais e explorador de palavras-chave.
