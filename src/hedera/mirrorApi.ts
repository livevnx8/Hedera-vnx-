import axios from 'axios';
import { config } from '../config.js';

function base() {
  return config.MIRROR_NODE_BASE_URL;
}

export async function getAccountInfo(accountId: string) {
  const { data } = await axios.get(`${base()}/api/v1/accounts/${accountId}`);
  return {
    account: data.account as string,
    balance: {
      tinybars: String(data.balance?.balance ?? 0),
      hbars: (data.balance?.balance ?? 0) / 1e8,
    },
    memo: data.memo as string,
    key: data.key as unknown,
    created_timestamp: data.created_timestamp as string,
    expiry_timestamp: data.expiry_timestamp as string,
  };
}

export async function getAccountBalance(accountId: string) {
  const { data } = await axios.get(`${base()}/api/v1/balances?account.id=${accountId}`);
  const tinybar: number = (data.balances as Array<{ balance: number }>)?.[0]?.balance ?? 0;
  return { hbars: tinybar / 1e8, tinybars: String(tinybar) };
}

export async function getAccountTokens(accountId: string) {
  const { data } = await axios.get(`${base()}/api/v1/accounts/${accountId}/tokens`);
  return (data.tokens ?? []) as unknown[];
}

export async function getTransactionById(txId: string) {
  const { data } = await axios.get(`${base()}/api/v1/transactions/${encodeURIComponent(txId)}`);
  return (data.transactions as unknown[])?.[0] ?? null;
}

export async function searchTokens(query: string, limit = 10) {
  const q = query.trim().toLowerCase();

  // Primary: full registry (curated + 2000+ generated tokens from Mirror Node)
  const { searchRegistryAsync } = await import('./tokenRegistry.js');
  const registryHits = await searchRegistryAsync(q, limit);
  if (registryHits.length > 0) return registryHits;

  // Fallback: CoinGecko platform list (covers newer / less-known tokens)
  try {
    const { data } = await axios.get<Record<string, unknown>[]>(
      'https://api.coingecko.com/api/v3/coins/list?include_platform=true',
      { timeout: 10_000 },
    );
    const MAX_HEDERA_ID = 50_000_000;
    const matches = (data ?? [])
      .filter((t) => {
        const addr = String((t['platforms'] as Record<string, string>)?.['hedera-hashgraph'] ?? '');
        if (!addr) return false;
        const sym  = String(t['symbol'] ?? '').toLowerCase();
        const name = String(t['name']   ?? '').toLowerCase();
        return sym === q || sym.includes(q) || name.includes(q);
      })
      .map((t) => {
        const addr = String((t['platforms'] as Record<string, string>)['hedera-hashgraph']);
        const tokenId = addr.startsWith('0x') ? `0.0.${parseInt(addr, 16)}` : addr;
        const num = parseInt(tokenId.split('.')[2] ?? '0', 10);
        return { token_id: tokenId, symbol: String(t['symbol'] ?? ''), name: String(t['name'] ?? ''), decimals: 0, type: 'FUNGIBLE_COMMON', _num: num };
      })
      .filter((t) => t._num > 0 && t._num < MAX_HEDERA_ID)
      .sort((a, b) => {
        const aE = a.symbol.toLowerCase() === q ? 0 : 1;
        const bE = b.symbol.toLowerCase() === q ? 0 : 1;
        return aE - bE;
      });

    if (matches.length > 0) return matches.slice(0, limit).map(({ _num: _, ...rest }) => rest);
  } catch { /* fall through */ }

  // Last resort: mirror node token lookup by token ID if query looks like one
  if (/^\d+\.\d+\.\d+$/.test(query)) {
    const { data } = await axios.get(`${base()}/api/v1/tokens/${query}`);
    return [{ token_id: query, name: data.name, symbol: data.symbol, type: data.type, decimals: data.decimals }];
  }

  return [];
}

export async function getHcsMessages(topicId: string, limit = 25) {
  const { data } = await axios.get(
    `${base()}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`
  );
  return (
    (data.messages as Array<{ message: string; consensus_timestamp: string; sequence_number: number }>) ?? []
  ).map((m) => ({
    sequence_number: m.sequence_number,
    consensus_timestamp: m.consensus_timestamp,
    message: Buffer.from(m.message, 'base64').toString('utf-8'),
  }));
}
