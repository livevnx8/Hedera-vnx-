/**
 * txApproval.ts
 * In-memory store for transactions awaiting UI approval before execution.
 * TTL: 5 minutes. Each pending tx is keyed by a UUID.
 */

import { randomUUID } from 'crypto';

export interface PendingTx {
  txId: string;
  tool: string;
  args: Record<string, unknown>;
  label: string;
  details: Record<string, unknown>;
  createdAt: number;
}

const store = new Map<string, PendingTx>();
const TTL_MS = 5 * 60 * 1000;

export function storePendingTx(
  tool: string,
  args: Record<string, unknown>,
  label: string,
  details: Record<string, unknown>,
): string {
  const txId = randomUUID();
  store.set(txId, { txId, tool, args, label, details, createdAt: Date.now() });
  for (const [id, tx] of store.entries()) {
    if (Date.now() - tx.createdAt > TTL_MS) store.delete(id);
  }
  return txId;
}

export function getPendingTx(txId: string): PendingTx | undefined {
  return store.get(txId);
}

export function removePendingTx(txId: string): boolean {
  return store.delete(txId);
}

export const PENDING_TX_SENTINEL = '__pending_tx__';
