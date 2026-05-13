const BASE = ''

export async function fetchJSON<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  // Marketplace
  getTasks: (status?: string) => fetchJSON(`/marketplace/tasks${status ? `?status=${status}` : ''}`),
  getTask: (id: string) => fetchJSON(`/marketplace/tasks/${id}`),
  postTask: (data: any) => fetchJSON('/marketplace/tasks', { method: 'POST', body: JSON.stringify(data) }),
  getMarketplaceStats: () => fetchJSON('/marketplace/stats'),
  getMarketplaceEvents: (limit = 50) => fetchJSON(`/marketplace/events?limit=${limit}`),
  getAgents: () => fetchJSON('/marketplace/agents'),

  // Workflow Agents
  getAgentStats: () => fetchJSON('/agents/stats'),
  getAgentList: () => fetchJSON('/agents/list'),
  runDomain: (domain: string) => fetchJSON(`/agents/${domain}`),

  // Streaming
  getStreamHistory: (limit = 50) => fetchJSON(`/stream/history?limit=${limit}`),
  getStreamStats: () => fetchJSON('/stream/stats'),

  // AI
  decompose: (description: string) => fetchJSON('/ai/decompose', { method: 'POST', body: JSON.stringify({ description }) }),
  ask: (question: string) => fetchJSON('/ai/ask', { method: 'POST', body: JSON.stringify({ question }) }),
  getModels: () => fetchJSON('/ai/models'),
  getAIStats: () => fetchJSON('/ai/stats'),

  // Generic
  get: (path: string) => fetchJSON(path),
  post: (path: string, data: any) => fetchJSON(path, { method: 'POST', body: JSON.stringify(data) }),

  // Proof
  getProofStats: () => fetchJSON('/proof/stats'),
  getProofReceipts: (limit = 20) => fetchJSON(`/proof/receipts?limit=${limit}`),
  getProofChain: (taskId: string) => fetchJSON(`/proof/chain/${taskId}`),
  verifyProof: (data: any) => fetchJSON('/proof/verify', { method: 'POST', body: JSON.stringify(data) }),

  // Verifiable AI
  getVerifiableAgents: () => fetchJSON('/api/vera/verifiable-ai/agents'),
  runVerifiableTask: (data: any) => fetchJSON('/api/vera/verifiable-ai/tasks', { method: 'POST', body: JSON.stringify(data) }),
  runNow: (data: any) => fetchJSON('/api/vera/verifiable-ai/run-now', { method: 'POST', body: JSON.stringify(data) }),
  getProofRuns: (limit = 20) => fetchJSON(`/api/vera/verifiable-ai/runs?limit=${limit}`),
  getProofRun: (id: string) => fetchJSON(`/api/vera/verifiable-ai/runs/${id}`),

  // Learning
  getLearningStats: () => fetchJSON('/api/vera/learning/stats'),
  getLoops: (status?: string) => fetchJSON(`/api/vera/learning/loops${status ? `?status=${status}` : ''}`),
  getLessons: () => fetchJSON('/api/vera/learning/lessons'),
  getPackages: () => fetchJSON('/api/vera/learning/packages'),
}
