import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ParametrosVolumetria,
  ResultadoVolumetria,
  WorkerVolumetriaMessageRequest,
  WorkerVolumetriaMessageResponse,
} from '../domain/volumetria.types.js';

export interface WorkerPoolOptions {
  /** Quantidade fixa de threads no pool. Padrão: número de cores da CPU (mínimo 2, máximo 8) */
  size?: number;
  /** Caminho customizado para o script do worker (opcional) */
  workerScriptPath?: string;
}

export interface WorkerPoolStats {
  totalWorkers: number;
  busyWorkers: number;
  idleWorkers: number;
  queueLength: number;
}

interface QueuedTask {
  id: string;
  params: ParametrosVolumetria;
  resolve: (value: ResultadoVolumetria) => void;
  reject: (reason: Error) => void;
}

interface ActiveTask {
  resolve: (value: ResultadoVolumetria) => void;
  reject: (reason: Error) => void;
  workerIndex: number;
}

export class WorkerPool {
  private readonly size: number;
  private readonly workers: Worker[] = [];
  private readonly busyStatus: boolean[] = [];
  private readonly taskQueue: QueuedTask[] = [];
  private readonly activeTasks = new Map<string, ActiveTask>();
  private isDestroyed = false;
  private readonly scriptPath: string;
  private readonly execArgv: string[];

  constructor(options: WorkerPoolOptions = {}) {
    const cores = os.availableParallelism?.() ?? os.cpus().length ?? 4;
    this.size = options.size ?? Math.max(2, Math.min(cores, 8));

    if (options.workerScriptPath) {
      this.scriptPath = options.workerScriptPath;
      this.execArgv = this.scriptPath.endsWith('.ts') ? ['--import', 'tsx'] : [];
    } else {
      const resolved = WorkerPool.resolveDefaultWorkerScript();
      this.scriptPath = resolved.path;
      this.execArgv = resolved.execArgv;
    }

    this.initPool();
  }

  /**
   * Identifica o caminho do script de worker conforme o ambiente:
   * Em runtime de desenvolvimento (tsx/vitest) utiliza o arquivo .ts com loader;
   * Em produção compilada (dist/) utiliza o arquivo .js nativo.
   */
  private static resolveDefaultWorkerScript(): { path: string; execArgv: string[] } {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const jsPath = resolve(currentDir, 'volumetria.worker.js');
    const tsPath = resolve(currentDir, 'volumetria.worker.ts');

    if (existsSync(jsPath)) {
      return { path: jsPath, execArgv: [] };
    }

    return { path: tsPath, execArgv: ['--import', 'tsx'] };
  }

  private initPool(): void {
    for (let i = 0; i < this.size; i++) {
      this.spawnWorker(i);
    }
  }

  private spawnWorker(index: number): void {
    const worker = new Worker(this.scriptPath, {
      execArgv: this.execArgv,
    });

    this.workers[index] = worker;
    this.busyStatus[index] = false;

    worker.on('message', (message: WorkerVolumetriaMessageResponse) => {
      const active = this.activeTasks.get(message.id);
      if (active) {
        this.activeTasks.delete(message.id);
        this.busyStatus[active.workerIndex] = false;

        if (message.success && message.data) {
          active.resolve(message.data);
        } else {
          active.reject(new Error(message.error ?? 'Erro desconhecido na Worker Thread'));
        }
      }

      this.dispatchNext();
    });

    worker.on('error', (err: Error) => {
      // Rejeita qualquer tarefa que estava rodando neste worker
      for (const [taskId, active] of this.activeTasks.entries()) {
        if (active.workerIndex === index) {
          active.reject(new Error(`Falha crítica na Worker Thread: ${err.message}`));
          this.activeTasks.delete(taskId);
          break;
        }
      }

      this.busyStatus[index] = false;

      // Se o pool não foi destruído, recria o worker para manter a capacidade
      if (!this.isDestroyed) {
        try {
          void worker.terminate();
        } catch {
          // Worker já pode estar encerrado
        }
        this.spawnWorker(index);
        this.dispatchNext();
      }
    });

    worker.on('exit', (code: number) => {
      if (code !== 0 && !this.isDestroyed) {
        // Se saiu com erro anormal e não foi destroy manual, recria
        this.busyStatus[index] = false;
        this.spawnWorker(index);
        this.dispatchNext();
      }
    });
  }

  /**
   * Submete uma tarefa de cálculo pesado de volumetria ao pool.
   * Se houver workers ociosos, é executada imediatamente;
   * caso contrário, aguarda na fila FIFO.
   */
  public execute(params: ParametrosVolumetria = {}): Promise<ResultadoVolumetria> {
    if (this.isDestroyed) {
      return Promise.reject(new Error('WorkerPool foi destruído e não aceita novas tarefas.'));
    }

    return new Promise<ResultadoVolumetria>((resolve, reject) => {
      const id = randomUUID();
      const task: QueuedTask = { id, params, resolve, reject };

      this.taskQueue.push(task);
      this.dispatchNext();
    });
  }

  private dispatchNext(): void {
    if (this.isDestroyed || this.taskQueue.length === 0) {
      return;
    }

    // Busca o primeiro worker livre
    const idleIndex = this.busyStatus.findIndex((busy) => !busy);
    if (idleIndex === -1) {
      // Todos os workers estão ocupados no momento
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) return;

    this.busyStatus[idleIndex] = true;
    this.activeTasks.set(task.id, {
      resolve: task.resolve,
      reject: task.reject,
      workerIndex: idleIndex,
    });

    const worker = this.workers[idleIndex];
    if (worker) {
      const request: WorkerVolumetriaMessageRequest = {
        id: task.id,
        params: task.params,
      };
      worker.postMessage(request);
    }
  }

  /**
   * Retorna estatísticas em tempo real da saúde e carga do Worker Pool.
   */
  public stats(): WorkerPoolStats {
    const busyWorkers = this.busyStatus.filter(Boolean).length;
    return {
      totalWorkers: this.size,
      busyWorkers,
      idleWorkers: this.size - busyWorkers,
      queueLength: this.taskQueue.length,
    };
  }

  /**
   * Encerra graciosamente todos os workers e esvazia a fila.
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Rejeita tarefas pendentes na fila
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      task?.reject(new Error('WorkerPool encerrado antes da execução da tarefa.'));
    }

    // Rejeita todas as tarefas ativas em andamento
    for (const [taskId, active] of this.activeTasks.entries()) {
      active.reject(new Error('WorkerPool foi destruído durante a execução da tarefa.'));
      this.activeTasks.delete(taskId);
    }

    // Encerra todos os workers
    const terminationPromises = this.workers.map((worker) => worker.terminate());
    await Promise.all(terminationPromises);
  }

  /**
   * Alias para destroy(), compatível com interfaces padrão de encerramento de workers.
   */
  public async terminate(): Promise<void> {
    return this.destroy();
  }
}

// Instância singleton padrão do pool para reutilização nas rotas da aplicação
let defaultPoolInstance: WorkerPool | null = null;

export function getDefaultWorkerPool(): WorkerPool {
  if (!defaultPoolInstance) {
    defaultPoolInstance = new WorkerPool();
  }
  return defaultPoolInstance;
}

export async function resetDefaultWorkerPool(): Promise<void> {
  if (defaultPoolInstance) {
    await defaultPoolInstance.destroy();
    defaultPoolInstance = null;
  }
}
