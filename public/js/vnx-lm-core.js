const MAGIC = [0x56, 0x4e, 0x58];
const FORMAT_VERSION = 1;
const PACKING = 'ternary-5-per-byte';
const TO_TRIT = new Map([
  [-1, 0],
  [0, 1],
  [1, 2],
]);
const FROM_TRIT = [-1, 0, 1];

export const VNX_FORMAT = Object.freeze({
  magic: 'VNX',
  version: FORMAT_VERSION,
  packing: PACKING,
});

export const DEFAULT_CONTEXT_SIZE = 4;
export const DEFAULT_VERTEX_COUNT = 60;

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

export const DODECAHEDRON_VERTICES = Object.freeze([
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
  [0, -INV_PHI, -PHI],
  [0, -INV_PHI, PHI],
  [0, INV_PHI, -PHI],
  [0, INV_PHI, PHI],
  [-INV_PHI, -PHI, 0],
  [-INV_PHI, PHI, 0],
  [INV_PHI, -PHI, 0],
  [INV_PHI, PHI, 0],
  [-PHI, 0, -INV_PHI],
  [PHI, 0, -INV_PHI],
  [-PHI, 0, INV_PHI],
  [PHI, 0, INV_PHI],
].map(normalize3));

export function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function buildDodecahedronEdges(vertices = DODECAHEDRON_VERTICES) {
  let min = Infinity;
  const distances = [];

  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const distance = Math.hypot(
        vertices[i][0] - vertices[j][0],
        vertices[i][1] - vertices[j][1],
        vertices[i][2] - vertices[j][2],
      );
      distances.push([i, j, distance]);
      if (distance > 1e-6 && distance < min) min = distance;
    }
  }

  return distances
    .filter(([, , distance]) => distance <= min * 1.08)
    .map(([from, to]) => [from, to]);
}

export const DODECAHEDRON_EDGES = Object.freeze(buildDodecahedronEdges());

export function generateSphereVertices(count) {
  const vertices = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    vertices.push(normalize3([
      Math.cos(theta) * radius,
      y,
      Math.sin(theta) * radius,
    ]));
  }
  return Object.freeze(vertices);
}

export function generateEdges(vertices, connectionsPerVertex = 3) {
  const edges = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const distances = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const dx = vertices[i][0] - vertices[j][0];
        const dy = vertices[i][1] - vertices[j][1];
        const dz = vertices[i][2] - vertices[j][2];
        distances.push({ index: j, dist: dx * dx + dy * dy + dz * dz });
      }
    }
    distances.sort((a, b) => a.dist - b.dist);
    for (let k = 0; k < connectionsPerVertex && k < distances.length; k++) {
      const j = distances[k].index;
      if (i < j) edges.push([i, j]);
    }
  }
  return Object.freeze(edges);
}

export function buildVocab(corpus) {
  const seen = new Set();
  const vocab = [];

  for (const char of Array.from(corpus || '')) {
    if (!seen.has(char)) {
      seen.add(char);
      vocab.push(char);
    }
  }

  return vocab.sort((a, b) => {
    const codeA = a.codePointAt(0) ?? 0;
    const codeB = b.codePointAt(0) ?? 0;
    return codeA === codeB ? a.localeCompare(b) : codeA - codeB;
  });
}

export function embedContext(context, vocab = []) {
  const chars = Array.from(context || '');
  const vocabIndex = new Map(vocab.map((char, index) => [char, index]));
  let x = 0;
  let y = 0;
  let z = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    const index = vocabIndex.has(char) ? vocabIndex.get(char) + 1 : (char.codePointAt(0) ?? 0) + 1;
    const position = i + 1;
    const angleA = index * 0.754877666 + position * 0.6180339887;
    const angleB = index * 0.569840291 + position * 1.3247179572;
    const weight = position / Math.max(1, chars.length);

    x += Math.cos(angleA) * weight;
    y += Math.sin(angleA) * weight;
    z += Math.cos(angleB) * Math.sin(angleA * 0.5) * weight;
  }

  if (chars.length === 0) return [1, 0, 0];
  return normalize3([x, y, z]);
}

export function routeContext(context, vocab = [], vertices = DODECAHEDRON_VERTICES) {
  const vector = embedContext(context, vocab);
  let best = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < vertices.length; i += 1) {
    const vertex = vertices[i];
    const score = vector[0] * vertex[0] + vector[1] * vertex[1] + vector[2] * vertex[2];
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }

  return { vertex: best, score: bestScore, vector };
}

export function ternarizeRows(valuesByVertex) {
  return valuesByVertex.map((row) => {
    const meanAbs = row.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, row.length);
    if (meanAbs === 0) return row.map(() => 0);

    return row.map((value) => {
      if (value > meanAbs) return 1;
      if (value < -meanAbs) return -1;
      return 0;
    });
  });
}

export function softmax(logits, temperature = 0.85) {
  const t = Number.isFinite(temperature) && temperature > 0 ? temperature : 0.85;
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp((value - max) / t));
  const sum = exps.reduce((total, value) => total + value, 0) || 1;
  return exps.map((value) => value / sum);
}

export function getVertexProbabilities(model, vertex, temperature = 0.85) {
  const row = model.weights[vertex] || [];
  const logits = row.map((weight) => weight * 1.75);
  return softmax(logits, temperature);
}

export function getTopCandidates(model, vertex, temperature = 0.85, count = 5) {
  const probabilities = getVertexProbabilities(model, vertex, temperature);
  return probabilities
    .map((probability, index) => ({ token: model.vocab[index], probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, count);
}

export function summarizeWeights(weights) {
  const totals = { negative: 0, zero: 0, positive: 0, total: 0 };

  for (const row of weights) {
    for (const weight of row) {
      if (weight < 0) totals.negative += 1;
      else if (weight > 0) totals.positive += 1;
      else totals.zero += 1;
      totals.total += 1;
    }
  }

  return {
    ...totals,
    negativePct: totals.total ? totals.negative / totals.total : 0,
    zeroPct: totals.total ? totals.zero / totals.total : 0,
    positivePct: totals.total ? totals.positive / totals.total : 0,
  };
}

export function estimatePackedWeightBytes(weights) {
  const totalWeights = weights.reduce((total, row) => total + row.length, 0);
  return Math.ceil(totalWeights / 5);
}

export function trainVnxModel(corpus, options = {}) {
  const chars = Array.from(corpus || '');
  const contextSize = options.contextSize ?? DEFAULT_CONTEXT_SIZE;
  const vertexCount = options.vertexCount ?? DEFAULT_VERTEX_COUNT;
  const vocab = options.vocab?.length ? [...options.vocab] : buildVocab(corpus);

  if (vocab.length === 0) {
    throw new Error('VNX-LM needs at least one character in the corpus.');
  }

  if (chars.length <= contextSize) {
    throw new Error(`VNX-LM needs more than ${contextSize} characters to forge a work tree.`);
  }

  const vocabIndex = new Map(vocab.map((char, index) => [char, index]));
  const counts = Array.from({ length: vertexCount }, () => Array(vocab.length).fill(0));
  const fired = new Set();
  const totalSteps = chars.length - contextSize;
  const progressInterval = Math.max(1, Math.floor(totalSteps / 80));

  const vertices = vertexCount === 20 ? DODECAHEDRON_VERTICES : generateSphereVertices(vertexCount);
  const edges = vertexCount === 20 ? DODECAHEDRON_EDGES : generateEdges(vertices);

  for (let i = contextSize; i < chars.length; i += 1) {
    const context = chars.slice(i - contextSize, i).join('');
    const target = chars[i];
    const targetIndex = vocabIndex.get(target);
    const routed = routeContext(context, vocab, vertices);
    const vertex = routed.vertex % vertexCount;

    fired.add(vertex);
    counts[vertex][targetIndex] += 1;

    if (typeof options.onProgress === 'function' && ((i - contextSize) % progressInterval === 0 || i === chars.length - 1)) {
      options.onProgress({
        progress: (i - contextSize + 1) / totalSteps,
        currentVertex: vertex,
        trainedTokens: i - contextSize + 1,
        firedVertices: fired.size,
      });
    }
  }

  const globalCounts = Array(vocab.length).fill(0);
  for (const row of counts) {
    for (let i = 0; i < row.length; i += 1) {
      globalCounts[i] += row[i];
    }
  }

  const globalTotal = globalCounts.reduce((sum, value) => sum + value, 0);
  const values = counts.map((row) => {
    const rowTotal = row.reduce((sum, value) => sum + value, 0);
    return row.map((count, index) => {
      const local = Math.log((count + 0.5) / (rowTotal + vocab.length * 0.5));
      const global = Math.log((globalCounts[index] + 0.5) / (globalTotal + vocab.length * 0.5));
      return local - global;
    });
  });

  const weights = ternarizeRows(values);
  const histogram = summarizeWeights(weights);
  const perplexity = calculatePerplexity({ vocab, weights, contextSize, vertices, vertexCount }, chars);
  const packedWeightBytes = estimatePackedWeightBytes(weights);

  return {
    format: VNX_FORMAT,
    name: options.name || 'VNX-LM',
    architecture: 'dodecahedron-worktree-bitnet-b1.58-char',
    topology: vertexCount === 20 ? 'dodecahedron' : 'sphere',
    tokenizerFamily: options.tokenizerFamily || 'char',
    contextSize,
    vertexCount,
    vocab,
    weights,
    vertices,
    edges,
    histogram,
    trainedTokens: totalSteps,
    firedVertices: fired.size,
    perplexity,
    packedWeightBytes,
    createdAt: options.createdAt || new Date().toISOString(),
    corpusHash: options.corpusHash || null,
  };
}

export function calculatePerplexity(model, chars) {
  const sequence = Array.isArray(chars) ? chars : Array.from(chars || '');
  const contextSize = model.contextSize ?? DEFAULT_CONTEXT_SIZE;
  let nll = 0;
  let count = 0;

  for (let i = contextSize; i < sequence.length; i += 1) {
    const context = sequence.slice(i - contextSize, i).join('');
    const target = sequence[i];
    const targetIndex = model.vocab.indexOf(target);
    if (targetIndex < 0) continue;

    const { vertex } = routeContext(context, model.vocab, model.vertices || DODECAHEDRON_VERTICES);
    const probabilities = getVertexProbabilities(model, vertex, 0.85);
    nll += -Math.log(probabilities[targetIndex] || 1 / model.vocab.length);
    count += 1;
  }

  return count ? Math.exp(nll / count) : Infinity;
}

export function sampleToken(model, context, options = {}) {
  const temperature = options.temperature ?? 0.85;
  const routed = routeContext(context, model.vocab, model.vertices || DODECAHEDRON_VERTICES);
  const vertex = routed.vertex % model.vertexCount;
  const probabilities = getVertexProbabilities(model, vertex, temperature);
  const top = getTopCandidates(model, vertex, temperature, 5);
  const random = typeof options.random === 'function' ? options.random() : Math.random();
  let cumulative = 0;
  let selectedIndex = probabilities.length - 1;

  for (let i = 0; i < probabilities.length; i += 1) {
    cumulative += probabilities[i];
    if (random <= cumulative) {
      selectedIndex = i;
      break;
    }
  }

  return {
    token: model.vocab[selectedIndex],
    vertex,
    top,
    probability: probabilities[selectedIndex],
    routeScore: routed.score,
  };
}

export function generateText(model, prompt, options = {}) {
  const maxTokens = Math.max(1, Math.min(400, options.maxTokens ?? 96));
  let context = Array.from(prompt || '').slice(-model.contextSize).join('');
  let text = '';
  const trace = [];

  if (context.length < model.contextSize) {
    context = `${' '.repeat(model.contextSize)}${context}`.slice(-model.contextSize);
  }

  for (let i = 0; i < maxTokens; i += 1) {
    const sampled = sampleToken(model, context, options);
    text += sampled.token;
    trace.push({
      index: i,
      token: sampled.token,
      vertex: sampled.vertex,
      vertexLabel: `v${String(sampled.vertex).padStart(2, '0')}`,
      top: sampled.top,
      probability: sampled.probability,
    });
    context = Array.from(`${context}${sampled.token}`).slice(-model.contextSize).join('');
  }

  return { text, trace };
}

export function packTernaryWeights(weights) {
  const flat = Array.isArray(weights[0]) ? weights.flat() : weights;
  const bytes = new Uint8Array(Math.ceil(flat.length / 5));

  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    let packed = 0;
    let multiplier = 1;

    for (let offset = 0; offset < 5; offset += 1) {
      const value = flat[byteIndex * 5 + offset] ?? 0;
      if (!TO_TRIT.has(value)) {
        throw new Error(`Invalid ternary weight: ${value}`);
      }
      packed += TO_TRIT.get(value) * multiplier;
      multiplier *= 3;
    }

    bytes[byteIndex] = packed;
  }

  return bytes;
}

export function unpackTernaryWeights(bytes, totalWeights) {
  const weights = [];

  for (const byte of bytes) {
    let value = byte;
    for (let offset = 0; offset < 5 && weights.length < totalWeights; offset += 1) {
      const trit = value % 3;
      weights.push(FROM_TRIT[trit]);
      value = Math.floor(value / 3);
    }
  }

  return weights;
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  return sha256BytesHex(data);
}

export async function sha256BytesHex(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    return bytesToHex(new Uint8Array(digest));
  }

  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(Buffer.from(data)).digest('hex');
}

export async function trainVnxModelWithHash(corpus, options = {}) {
  const corpusHash = await sha256Hex(corpus || '');
  return trainVnxModel(corpus, { ...options, corpusHash });
}

export async function exportVnxModel(model, options = {}) {
  const weights = model.weights;
  const packedWeights = packTernaryWeights(weights);
  const metadata = {
    name: model.name || 'VNX-LM',
    architecture: model.architecture,
    topology: model.topology || 'dodecahedron',
    tokenizerFamily: model.tokenizerFamily || 'char',
    contextSize: model.contextSize,
    vertexCount: model.vertexCount,
    vocab: model.vocab,
    trainedTokens: model.trainedTokens,
    firedVertices: model.firedVertices,
    perplexity: Number.isFinite(model.perplexity) ? Number(model.perplexity.toFixed(6)) : null,
    histogram: model.histogram,
    corpusHash: options.corpusHash || model.corpusHash || null,
    createdAt: model.createdAt || new Date().toISOString(),
    packing: PACKING,
    totalWeights: weights.reduce((total, row) => total + row.length, 0),
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const output = new Uint8Array(12 + metadataBytes.length + packedWeights.length);
  const view = new DataView(output.buffer);

  output.set(MAGIC, 0);
  output[3] = FORMAT_VERSION;
  output[4] = 0;
  output[5] = model.contextSize;
  output[6] = model.vertexCount;
  output[7] = 0;
  view.setUint32(8, metadataBytes.length, true);
  output.set(metadataBytes, 12);
  output.set(packedWeights, 12 + metadataBytes.length);

  return output;
}

export async function hashVnxModel(model) {
  const data = JSON.stringify({
    corpusHash: model.corpusHash,
    contextSize: model.contextSize,
    vertexCount: model.vertexCount,
    vocabulary: model.vocab,
    weights: model.weights,
  });
  return sha256Hex(data);
}

export function importVnxModel(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 12 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) {
    throw new Error('Not a VNX model file.');
  }

  const version = bytes[3];
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported VNX model version: ${version}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const metadataLength = view.getUint32(8, true);
  const metadataStart = 12;
  const metadataEnd = metadataStart + metadataLength;
  if (metadataEnd > bytes.length) {
    throw new Error('VNX metadata is truncated.');
  }

  const metadata = JSON.parse(new TextDecoder().decode(bytes.slice(metadataStart, metadataEnd)));
  if (metadata.packing !== PACKING) {
    throw new Error(`Unsupported VNX packing: ${metadata.packing}`);
  }

  const packedWeights = bytes.slice(metadataEnd);
  const flat = unpackTernaryWeights(packedWeights, metadata.totalWeights);
  const weights = [];

  for (let vertex = 0; vertex < metadata.vertexCount; vertex += 1) {
    const start = vertex * metadata.vocab.length;
    weights.push(flat.slice(start, start + metadata.vocab.length));
  }

  const vertexCount = metadata.vertexCount || 20;
  const restoredVertices = vertexCount === 20 ? DODECAHEDRON_VERTICES : generateSphereVertices(vertexCount);
  const restoredEdges = vertexCount === 20 ? DODECAHEDRON_EDGES : generateEdges(restoredVertices);

  return {
    format: VNX_FORMAT,
    name: metadata.name || 'VNX-LM',
    architecture: metadata.architecture,
    topology: metadata.topology,
    tokenizerFamily: metadata.tokenizerFamily || 'char',
    contextSize: metadata.contextSize,
    vertexCount,
    vocab: metadata.vocab,
    weights,
    vertices: restoredVertices,
    edges: restoredEdges,
    histogram: summarizeWeights(weights),
    trainedTokens: metadata.trainedTokens,
    firedVertices: metadata.firedVertices,
    perplexity: metadata.perplexity,
    packedWeightBytes: packedWeights.length,
    corpusHash: metadata.corpusHash,
    createdAt: metadata.createdAt,
  };
}

export function canonicalJson(value) {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortCanonical(value[key]);
      return result;
    }, {});
}

export function normalizeTrace(trace = []) {
  return trace.map((item, index) => ({
    index: Number.isFinite(item.index) ? item.index : index,
    token: item.token,
    vertex: item.vertex,
    vertexLabel: item.vertexLabel || `v${String(item.vertex).padStart(2, '0')}`,
    probability: roundFloat(item.probability),
    top: (item.top || []).map((candidate) => ({
      token: candidate.token,
      probability: roundFloat(candidate.probability),
    })),
  }));
}

function roundFloat(value) {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : null;
}

export async function createVnxProofPacket(input) {
  const model = input.model;
  const trace = normalizeTrace(input.trace || []);
  const output = input.output ?? trace.map((item) => item.token).join('');
  const modelBytes = input.modelBytes || await exportVnxModel(model);
  const modelHash = await sha256BytesHex(modelBytes);
  const promptHash = await sha256Hex(input.prompt || '');
  const outputHash = await sha256Hex(output || '');
  const traceHash = await sha256Hex(canonicalJson(trace));
  const uniqueVertices = [...new Set(trace.map((item) => item.vertex))].sort((a, b) => a - b);
  const createdAt = input.createdAt || new Date().toISOString();

  const modelSummary = {
    name: model.name || 'VNX-LM',
    hash: modelHash,
    corpusHash: model.corpusHash || null,
    architecture: model.architecture,
    topology: model.topology || 'dodecahedron',
    tokenizerFamily: model.tokenizerFamily || 'char',
    contextSize: model.contextSize,
    vertexCount: model.vertexCount,
    vocabSize: model.vocab.length,
    trainedTokens: model.trainedTokens,
    firedVertices: model.firedVertices,
    packedWeightBytes: model.packedWeightBytes,
    histogram: model.histogram,
  };

  const inferenceSummary = {
    promptHash,
    outputHash,
    traceHash,
    generatedTokens: trace.length,
    uniqueVertices,
    firstVertex: trace[0]?.vertexLabel || null,
    lastVertex: trace.at(-1)?.vertexLabel || null,
    topCandidateK: trace[0]?.top?.length || 0,
  };

  const hcsReadySummary = {
    standard: 'VNX-LM-PROOF-1',
    type: 'vnx.inference.proof',
    runtimeTier: input.runtimeTier || 'forge-browser',
    modelHash,
    corpusHash: modelSummary.corpusHash,
    promptHash,
    outputHash,
    traceHash,
    topology: modelSummary.topology,
    tokenizerFamily: modelSummary.tokenizerFamily,
    generatedTokens: trace.length,
    uniqueVertexCount: uniqueVertices.length,
  };

  const proofHash = await sha256Hex(canonicalJson({
    standard: hcsReadySummary.standard,
    type: hcsReadySummary.type,
    createdAt,
    runtimeTier: hcsReadySummary.runtimeTier,
    model: modelSummary,
    inference: inferenceSummary,
    trace,
  }));

  return {
    standard: hcsReadySummary.standard,
    type: hcsReadySummary.type,
    createdAt,
    proofHash,
    runtimeTier: hcsReadySummary.runtimeTier,
    privacy: 'hash_only_prompt_output',
    model: modelSummary,
    inference: inferenceSummary,
    hcsReadySummary: {
      ...hcsReadySummary,
      proofHash,
    },
    trace,
  };
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let _signalEmitter = null;

export function setSignalEmitter(emitter) {
  _signalEmitter = emitter;
}

export function emitSignal(type, payload) {
  if (_signalEmitter) {
    try {
      _signalEmitter(type, payload);
    } catch {
      // no-op
    }
  }
}
