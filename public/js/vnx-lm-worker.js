import { exportVnxModel, importVnxModel, trainVnxModelWithHash } from './vnx-lm-core.js';

let simdModule = null;

async function initSimd() {
  try {
    const { loadSimdModule, isSimdAvailable } = await import('./vnx-simd.js');
    if (isSimdAvailable()) simdModule = await loadSimdModule();
  } catch {
    simdModule = null;
  }
}

initSimd();

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};

  try {
    if (type === 'train') {
      const started = performance.now();
      const model = await trainVnxModelWithHash(payload.corpus, {
        contextSize: payload.contextSize,
        vertexCount: payload.vertexCount,
        name: payload.name,
        onProgress: (progress) => {
          self.postMessage({ id, type: 'progress', payload: progress });
        },
      });

      self.postMessage({
        id,
        type: 'trained',
        payload: {
          model,
          elapsedMs: performance.now() - started,
        },
      });
      return;
    }

    if (type === 'export') {
      const bytes = await exportVnxModel(payload.model);
      self.postMessage({ id, type: 'exported', payload: bytes.buffer }, [bytes.buffer]);
      return;
    }

    if (type === 'import') {
      const model = importVnxModel(payload.buffer);
      self.postMessage({ id, type: 'imported', payload: { model } });
      return;
    }

    throw new Error(`Unknown worker message type: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
};
