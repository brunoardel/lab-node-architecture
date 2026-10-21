import { parentPort } from 'node:worker_threads';
import { executarCalculoVolumetria } from '../domain/volumetria.service.js';
import {
  WorkerVolumetriaMessageRequest,
  WorkerVolumetriaMessageResponse,
} from '../domain/volumetria.types.js';

if (!parentPort) {
  throw new Error('volumetria.worker.ts deve ser executado exclusivamente dentro de uma Worker Thread.');
}

const activePort = parentPort;

activePort.on('message', (message: WorkerVolumetriaMessageRequest) => {
  try {
    const data = executarCalculoVolumetria(message.params);
    const response: WorkerVolumetriaMessageResponse = {
      id: message.id,
      success: true,
      data,
    };
    activePort.postMessage(response);
  } catch (err) {
    const response: WorkerVolumetriaMessageResponse = {
      id: message.id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    activePort.postMessage(response);
  }
});
