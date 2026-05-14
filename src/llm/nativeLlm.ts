import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import type { Llama, LlamaModel, LlamaContext } from 'node-llama-cpp';
import path from 'path';
import { config } from '../config.js';

let _llama: Llama | null = null;
let _model: LlamaModel | null = null;
let _context: LlamaContext | null = null;

export async function initNativeLlm(): Promise<void> {
  if (!config.MODEL_PATH) {
    throw new Error('MODEL_PATH must be set in .env when MODEL_PROVIDER=native');
  }

  const modelPath = path.resolve(config.MODEL_PATH);
  console.log(`[VERA] Loading native model: ${modelPath}`);

  _llama = await getLlama();
  _model = await _llama.loadModel({
    modelPath,
    gpuLayers: config.NATIVE_GPU_LAYERS,
  });

  _context = await _model.createContext({
    contextSize: config.NATIVE_CONTEXT_SIZE,
  });

  console.log(`[VERA] Native model ready (ctx=${config.NATIVE_CONTEXT_SIZE}, gpuLayers=${config.NATIVE_GPU_LAYERS})`);
}

export function isNativeReady(): boolean {
  return _context !== null;
}

export function createNativeSession(options: {
  systemPrompt?: string;
  chatHistory?: Parameters<LlamaChatSession['setChatHistory']>[0];
}): { session: LlamaChatSession; dispose: () => void } {
  if (!_context) throw new Error('Native LLM not initialized — call initNativeLlm() first');

  const sequence = _context.getSequence();
  const session = new LlamaChatSession({
    contextSequence: sequence,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    ...(options.chatHistory ? { chatHistory: options.chatHistory } : {}),
  });

  return {
    session,
    dispose: () => sequence.dispose(),
  };
}
