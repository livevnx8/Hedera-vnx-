export interface KnownToken {
  token_id: string;
  symbol: string;
  name: string;
  decimals: number;
  type: string;
  coingecko_id?: string;
}

export const KNOWN_TOKENS: KnownToken[] = [
  { token_id: '0.0.1456986', symbol: 'WHBAR',      name: 'Wrapped HBAR (SaucerSwap)',         decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'hedera-hashgraph' },
  { token_id: '0.0.834116',  symbol: 'HBARX',      name: 'HBARX',                             decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'hbarx' },
  { token_id: '0.0.731861',  symbol: 'SAUCE',      name: 'SaucerSwap',                        decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'saucerswap' },
  { token_id: '0.0.1460200', symbol: 'XSAUCE',     name: 'xSAUCE',                            decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'xsauce' },
  { token_id: '0.0.7893707', symbol: 'GIB',        name: '༼ つ ◕_◕ ༽つ',                      decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'gib' },
  { token_id: '0.0.7894159', symbol: 'DOSA',       name: 'Dosa the Demon',                    decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'dosa' },
  { token_id: '0.0.456858',  symbol: 'USDC',       name: 'USD Coin',                          decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'usd-coin' },
  { token_id: '0.0.1055459', symbol: 'USDC[HTS]',  name: 'Hashport Bridged USDC (Hedera)',    decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'usd-coin' },
  { token_id: '0.0.1055472', symbol: 'USDT[HTS]',  name: 'Hashport Bridged USDT (Hedera)',    decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'tether' },
  { token_id: '0.0.2283230', symbol: 'KARATE',     name: 'Karate Combat',                     decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'karate-combat' },
  { token_id: '0.0.859814',  symbol: 'CLXY',       name: 'Calaxy',                            decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'calaxy' },
  { token_id: '0.0.968069',  symbol: 'HST',        name: 'HeadStarter',                       decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'headstarter' },
  { token_id: '0.0.3210123', symbol: 'STEAM',      name: 'STEAM',                             decimals: 6,  type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.4794920', symbol: 'PACK',       name: 'HashPack',                          decimals: 6,  type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.7243470', symbol: 'XPACK',      name: 'xPACK',                             decimals: 6,  type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.786931',  symbol: 'HSUITE',     name: 'HubSuite',                          decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'hsuite' },
  { token_id: '0.0.4431990', symbol: 'BSL',        name: 'BankSocial',                        decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'banksocial' },
  { token_id: '0.0.127877',  symbol: 'JAM',        name: 'Tune.Fm',                           decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'tune-fm' },
  { token_id: '0.0.1055477', symbol: 'DAI[HTS]',   name: 'Bridged Dai Stablecoin (Hashport)', decimals: 18, type: 'FUNGIBLE_COMMON', coingecko_id: 'dai' },
  { token_id: '0.0.1055483', symbol: 'WBTC[HTS]',  name: 'Bridged Wrapped Bitcoin (Hashport)',decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'wrapped-bitcoin' },
  { token_id: '0.0.1055495', symbol: 'LINK[HTS]',  name: 'Hashport Bridged LINK',             decimals: 18, type: 'FUNGIBLE_COMMON', coingecko_id: 'chainlink' },
  { token_id: '0.0.8279134', symbol: 'BONZO',      name: 'Bonzo Finance',                     decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'bonzo-finance' },
  { token_id: '0.0.3706639', symbol: 'DAVINCI',    name: 'Davincigraph',                      decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'davincigraph' },
  { token_id: '0.0.3716059', symbol: 'DOVU',       name: 'DOVU',                              decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'dovu' },
  { token_id: '0.0.2964435', symbol: 'SAUCEINU',   name: 'Sauce Inu',                         decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'sauce-inu' },
  { token_id: '0.0.3241481', symbol: 'GC',         name: 'GCoin',                             decimals: 2,  type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.1958126', symbol: 'CARAT',      name: 'Diamond Standard Carat',            decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'diamond-standard-carat' },
  { token_id: '0.0.4873177', symbol: 'BTC.H',      name: 'Bitcoin.ℏ',                         decimals: 8,  type: 'FUNGIBLE_COMMON', coingecko_id: 'bitcoin-5' },
  { token_id: '0.0.3155326', symbol: 'BULL',       name: 'BullBar',                           decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'bullbar' },
  { token_id: '0.0.6070123', symbol: 'HCHF',       name: 'Hedera Swiss Franc',                decimals: 18, type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.6070128', symbol: 'HLQT',       name: 'Hedera Liquity',                    decimals: 18, type: 'FUNGIBLE_COMMON', coingecko_id: 'hedera-liquity' },
  { token_id: '0.0.6722561', symbol: 'HGG',        name: 'Hedera Guild Game',                 decimals: 6,  type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.5364570', symbol: 'HAI',        name: 'Hyzen.AI',                          decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'hyzen-ai' },
  { token_id: '0.0.4816828', symbol: 'HBARBARIAN', name: 'HBARbarian',                        decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'hbarbarian' },
  { token_id: '0.0.5022567', symbol: 'HBARK',      name: 'hBARK',                             decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'hbark' },
  { token_id: '0.0.1159074', symbol: 'GRELF',      name: 'GRELF',                             decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'grelf' },
  { token_id: '0.0.1304757', symbol: 'QNT[HTS]',   name: 'Hashport Bridged QNT',              decimals: 18, type: 'FUNGIBLE_COMMON', coingecko_id: 'quant-network' },
  { token_id: '0.0.4599983', symbol: 'MFM',        name: 'Meme Millionaires',                 decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'meme-millionaires' },
  { token_id: '0.0.4352885', symbol: 'STICKBUG',   name: 'stickbug',                          decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'stickbug' },
  { token_id: '0.0.7893551', symbol: 'FINS',       name: 'FINS',                              decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'fins' },
  { token_id: '0.0.7907968', symbol: 'DINO',       name: 'DINO',                              decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'dino' },
  { token_id: '0.0.7974354', symbol: 'LEEMON',     name: 'LeemonHead',                        decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'leemonhead' },
  { token_id: '0.0.8041571', symbol: 'SMACKM',     name: 'SMACKM',                            decimals: 0,  type: 'FUNGIBLE_COMMON' },
  { token_id: '0.0.8105204', symbol: 'IVY',        name: 'IVY',                               decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'ivy' },
  { token_id: '0.0.9632905', symbol: 'JEET',       name: 'Jeeteroo',                          decimals: 0,  type: 'FUNGIBLE_COMMON', coingecko_id: 'jeeteroo' },
  { token_id: '0.0.10282787',symbol: 'USDT0',      name: 'USDT0',                             decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'usdt0' },
  { token_id: '0.0.1985922', symbol: 'XSGD',       name: 'XSGD',                              decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'xsgd' },
  { token_id: '0.0.1157020', symbol: 'WAVAX[HTS]', name: 'Hashport Bridged wAVAX',            decimals: 18, type: 'FUNGIBLE_COMMON', coingecko_id: 'avalanche-2' },
  { token_id: '0.0.5989978', symbol: 'KBL',        name: 'Kabila',                            decimals: 6,  type: 'FUNGIBLE_COMMON', coingecko_id: 'kabila' },
];

// Extended token list — loaded once asynchronously on first search
let _allTokens: KnownToken[] = KNOWN_TOKENS;
let _loaded = false;

async function loadGeneratedTokens(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  try {
    const gen = await import('./tokenRegistry.generated.js') as {
      GENERATED_TOKENS?: KnownToken[];
      GENERATED_NFTS?: KnownToken[];
    };
    const generated = [...(gen.GENERATED_TOKENS ?? []), ...(gen.GENERATED_NFTS ?? [])];
    const knownIds = new Set(KNOWN_TOKENS.map((t) => t.token_id));
    const extras = generated.filter((t) => !knownIds.has(t.token_id));
    _allTokens = [...KNOWN_TOKENS, ...extras];
  } catch {
    // generated file missing — fall back to curated list
  }
}

// Kick off background load immediately at module init
void loadGeneratedTokens();

export async function searchRegistryAsync(query: string, limit = 10): Promise<KnownToken[]> {
  await loadGeneratedTokens();
  return searchRegistry(query, limit);
}

export function searchRegistry(query: string, limit = 10): KnownToken[] {
  const q = query.trim().toLowerCase();
  const exact:    KnownToken[] = [];
  const prefix:   KnownToken[] = [];
  const contains: KnownToken[] = [];

  for (const t of _allTokens) {
    const sym  = t.symbol.toLowerCase();
    const name = t.name.toLowerCase();
    const id   = t.token_id;
    if (sym === q || id === q) { exact.push(t); continue; }
    if (sym.startsWith(q) || name.startsWith(q)) { prefix.push(t); continue; }
    if (sym.includes(q) || name.includes(q)) { contains.push(t); }
  }

  return [...exact, ...prefix, ...contains].slice(0, limit);
}

export function getAllKnownTokens(): KnownToken[] {
  return _allTokens;
}
