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
}
