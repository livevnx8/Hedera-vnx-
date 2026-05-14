import axios from 'axios';
import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { creditDeposit } from '../ledger.js';
import { v4 as uuidv4 } from 'uuid';

const MEMO_PREFIX = 'vera:';

type MirrorTx = {
  transaction_id: string;
  consensus_timestamp: string;
  memo_base64?: string;
  transfers?: Array<{ account: string; amount: number }>;
  result?: string;
};

function decodeMemoBase64(b64?: string) {
  if (!b64) return '';
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export async function pollTreasuryOnce() {
  if (!config.TREASURY_ACCOUNT_ID) return;

  const last = db.prepare('SELECT MAX(consensus_timestamp) as ts FROM deposits').get() as { ts: string | null };
  const since = last.ts;

  const url = new URL(`/api/v1/transactions`, config.MIRROR_NODE_BASE_URL);
  url.searchParams.set('account.id', config.TREASURY_ACCOUNT_ID);
  url.searchParams.set('transactiontype', 'CRYPTOTRANSFER');
  url.searchParams.set('limit', '25');
  url.searchParams.set('order', 'asc');
  if (since) url.searchParams.set('timestamp', `gt:${since}`);

  const res = await axios.get(url.toString());
  const txs = (res.data?.transactions ?? []) as MirrorTx[];

  for (const tx of txs) {
    if (tx.result && tx.result !== 'SUCCESS') continue;

    const memo = decodeMemoBase64(tx.memo_base64);
    if (!memo.startsWith(MEMO_PREFIX)) continue;

    const customerId = memo.slice(MEMO_PREFIX.length).trim();
    if (!customerId) continue;

    const incomingTinybar = (tx.transfers ?? [])
      .filter((t) => t.account === config.TREASURY_ACCOUNT_ID)
      .reduce((sum, t) => sum + t.amount, 0);

    if (incomingTinybar <= 0) continue;

    const exists = db
      .prepare('SELECT 1 FROM deposits WHERE mirror_transaction_id = ? AND consensus_timestamp = ?')
      .get(tx.transaction_id, tx.consensus_timestamp);
    if (exists) continue;

    const usdRate = config.CREDIT_USD_PER_HBAR;
    const hbar = incomingTinybar / 1e8;
    const usdCredited = hbar * usdRate;

    const depositId = uuidv4();
    db.prepare(
      'INSERT INTO deposits (id, customer_id, mirror_transaction_id, consensus_timestamp, tinybar_amount, usd_rate, usd_credited, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(depositId, customerId, tx.transaction_id, tx.consensus_timestamp, incomingTinybar, usdRate, usdCredited, nowIso());

    creditDeposit(customerId, depositId, usdCredited);
  }
}

export function startTreasuryWatcher() {
  const intervalMs = 5000;
  setInterval(() => {
    pollTreasuryOnce().catch(error => {
      console.error('Failed to poll treasury:', error);
      // Consider implementing exponential backoff or circuit breaker
    });
  }, intervalMs);
}
