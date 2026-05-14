import axios from 'axios';
import { config } from '../config.js';

const NOT_CONFIGURED = { status: 'not_configured', message: 'QVX_NODE_URL is not set.' };

class QvxClient {
  get isConfigured(): boolean {
    return !!config.QVX_NODE_URL;
  }

  private get headers(): Record<string, string> {
    return config.QVX_NODE_API_KEY ? { Authorization: `Bearer ${config.QVX_NODE_API_KEY}` } : {};
  }

  private async get<T>(path: string): Promise<T> {
    const { data } = await axios.get<T>(`${config.QVX_NODE_URL}${path}`, {
      headers: this.headers,
      timeout: 10_000,
    });
    return data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const { data } = await axios.post<T>(`${config.QVX_NODE_URL}${path}`, body, {
      headers: this.headers,
      timeout: 10_000,
    });
    return data;
  }

  // ── Node health ────────────────────────────────────────────────────────────

  async getNodeStatus(): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    return this.get('/status');
  }

  async getNodeMetrics(): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    return this.get('/metrics');
  }

  // ── Trading intelligence ───────────────────────────────────────────────────

  async getPositions(): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    return this.get('/trading/positions');
  }

  async getSignals(params?: { market?: string; limit?: number }): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return this.get(`/trading/signals${qs}`);
  }

  async getPnl(params?: { period?: string }): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    const qs = params?.period ? `?period=${params.period}` : '';
    return this.get(`/trading/pnl${qs}`);
  }

  async getStrategyState(): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    return this.get('/trading/strategy');
  }

  async getMarketAnalysis(params: { market: string; timeframe?: string }): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    return this.get(`/trading/analysis?${qs}`);
  }

  async getLearningState(): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    return this.get('/learning/state');
  }

  async getTradeHistory(params?: { limit?: number; market?: string }): Promise<unknown> {
    if (!this.isConfigured) return NOT_CONFIGURED;
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return this.get(`/trading/history${qs}`);
  }

  // ── VNX observability signals ──────────────────────────────────────────────

  async emitVnxSignal(type: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!this.isConfigured) throw new Error('QVX node not configured — set QVX_NODE_URL');
    return this.post('/vnx/signal', {
      eventType: type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  // ── On-chain settlement ────────────────────────────────────────────────────

  async submitTransaction(tx: unknown): Promise<unknown> {
    if (!this.isConfigured) throw new Error('QVX node not configured — set QVX_NODE_URL');
    return this.post('/transaction', tx);
  }

  // ── Context snapshot (used for system prompt injection) ────────────────────

  async getTradingSnapshot(): Promise<string | null> {
    if (!this.isConfigured) return null;
    try {
      const [positions, signals, pnl, strategy] = await Promise.all([
        this.getPositions(),
        this.getSignals({ limit: 5 }),
        this.getPnl({ period: '24h' }),
        this.getStrategyState(),
      ]);
      return JSON.stringify({ positions, signals, pnl, strategy }, null, 2);
    } catch {
      return null;
    }
  }
}

export const qvxClient = new QvxClient();
