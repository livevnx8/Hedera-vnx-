#!/usr/bin/env python3
"""
Fetch comprehensive Hedera token + NFT data from Mirror Node + CoinGecko.
Outputs:
  - training/hedera-tokens-full.json   (all token metadata)
  - training/hedera-nfts-full.json     (NFT collections)
  - src/hedera/tokenRegistry.generated.ts  (expanded KNOWN_TOKENS)
"""

import json, time, sys
from pathlib import Path
import urllib.request, urllib.parse

MIRROR = "https://mainnet-public.mirrornode.hedera.com"
OUT_DIR = Path(__file__).parent.parent / "training"
OUT_DIR.mkdir(exist_ok=True)
REGISTRY_OUT = Path(__file__).parent.parent / "src" / "hedera" / "tokenRegistry.generated.ts"

def get(url, retries=3, delay=1.2):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "vera-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except Exception as e:
            if attempt == retries - 1:
                print(f"  [warn] {url}: {e}")
                return None
            time.sleep(delay * (attempt + 1))

def fetch_all_tokens(token_type="FUNGIBLE_COMMON", max_pages=20):
    """Page through Mirror Node token list."""
    tokens = []
    url = f"{MIRROR}/api/v1/tokens?type={token_type}&order=desc&limit=100"
    page = 0
    while url and page < max_pages:
        data = get(url)
        if not data:
            break
        batch = data.get("tokens", [])
        tokens.extend(batch)
        print(f"  [{token_type}] page {page+1}: {len(batch)} tokens (total: {len(tokens)})")
        next_link = data.get("links", {}).get("next")
        url = (MIRROR + next_link) if next_link else None
        page += 1
        time.sleep(0.3)
    return tokens

def fetch_token_detail(token_id):
    """Get full token detail including total_supply, custom_fees, etc."""
    data = get(f"{MIRROR}/api/v1/tokens/{token_id}")
    return data

def fetch_coingecko_hedera_coins():
    """Get all Hedera-platform coins from CoinGecko."""
    url = "https://api.coingecko.com/api/v3/coins/list?include_platform=true"
    print("  Fetching CoinGecko coin list...")
    data = get(url)
    if not data:
        return {}
    # Build token_id → coingecko_id map
    cg_map = {}
    for coin in data:
        platforms = coin.get("platforms", {})
        hedera_id = platforms.get("hedera-hashgraph", "") or platforms.get("hedera", "")
        if hedera_id and hedera_id.startswith("0.0."):
            cg_map[hedera_id] = coin["id"]
    print(f"  CoinGecko: {len(cg_map)} Hedera-mapped coins")
    return cg_map

def fetch_nft_collections(max_pages=10):
    """Fetch NFT collections with holder/supply data."""
    collections = []
    url = f"{MIRROR}/api/v1/tokens?type=NON_FUNGIBLE_UNIQUE&order=desc&limit=100"
    page = 0
    while url and page < max_pages:
        data = get(url)
        if not data:
            break
        batch = data.get("tokens", [])
        collections.extend(batch)
        print(f"  [NFT] page {page+1}: {len(batch)} collections (total: {len(collections)})")
        next_link = data.get("links", {}).get("next")
        url = (MIRROR + next_link) if next_link else None
        page += 1
        time.sleep(0.3)
    return collections

def enrich_token(tok, cg_map):
    """Add CoinGecko ID and normalize fields."""
    tid = tok.get("token_id", "")
    return {
        "token_id":    tid,
        "symbol":      tok.get("symbol", ""),
        "name":        tok.get("name", ""),
        "decimals":    int(tok.get("decimals", 0)),
        "type":        tok.get("type", "FUNGIBLE_COMMON"),
        "total_supply": tok.get("total_supply", "0"),
        "coingecko_id": cg_map.get(tid),
    }

# Existing curated CoinGecko IDs (from tokenRegistry.ts) — used for enrichment
CURATED_CG = {
    "0.0.1456986": "hedera-hashgraph", "0.0.834116": "hbarx",
    "0.0.731861": "saucerswap",        "0.0.1460200": "xsauce",
    "0.0.7893707": "gib",              "0.0.7894159": "dosa",
    "0.0.456858": "usd-coin",          "0.0.1055459": "usd-coin",
    "0.0.1055472": "tether",           "0.0.2283230": "karate-combat",
    "0.0.859814": "calaxy",            "0.0.968069": "headstarter",
    "0.0.786931": "hsuite",            "0.0.4431990": "banksocial",
    "0.0.127877": "tune-fm",           "0.0.1055477": "dai",
    "0.0.1055483": "wrapped-bitcoin",  "0.0.1055495": "chainlink",
    "0.0.8279134": "bonzo-finance",    "0.0.3706639": "davincigraph",
    "0.0.3716059": "dovu",             "0.0.2964435": "sauce-inu",
    "0.0.1958126": "diamond-standard-carat", "0.0.4873177": "bitcoin-5",
    "0.0.3155326": "bullbar",          "0.0.6070128": "hedera-liquity",
    "0.0.5364570": "hyzen-ai",         "0.0.4816828": "hbarbarian",
    "0.0.5022567": "hbark",            "0.0.1159074": "grelf",
    "0.0.1304757": "quant-network",    "0.0.4599983": "meme-millionaires",
    "0.0.4352885": "stickbug",         "0.0.7893551": "fins",
    "0.0.7907968": "dino",             "0.0.7974354": "leemonhead",
    "0.0.8105204": "ivy",              "0.0.9632905": "jeeteroo",
    "0.0.10282787": "usdt0",           "0.0.1985922": "xsgd",
    "0.0.1157020": "avalanche-2",      "0.0.5989978": "kabila",
}

def fetch_all_tokens_both_orders(token_type="FUNGIBLE_COMMON", pages_each=15):
    """Fetch newest AND oldest tokens to cover the full spectrum."""
    seen = set()
    result = []

    for order in ["desc", "asc"]:
        url = f"{MIRROR}/api/v1/tokens?type={token_type}&order={order}&limit=100"
        page = 0
        while url and page < pages_each:
            data = get(url)
            if not data:
                break
            batch = data.get("tokens", [])
            for t in batch:
                tid = t.get("token_id", "")
                if tid and tid not in seen:
                    seen.add(tid)
                    result.append(t)
            print(f"  [{token_type}/{order}] page {page+1}: +{len(batch)} (unique total: {len(result)})")
            next_link = data.get("links", {}).get("next")
            url = (MIRROR + next_link) if next_link else None
            page += 1
            time.sleep(0.25)

    return result

# ── Main ──────────────────────────────────────────────────────────────────────

print("=" * 60)
print("  Fetching Hedera token ecosystem (full spectrum)")
print("=" * 60)

# 1. Fungible tokens — newest AND oldest 1500 each
print("\n[1] Fetching fungible tokens (asc + desc)...")
fungible_raw = fetch_all_tokens_both_orders("FUNGIBLE_COMMON", pages_each=15)
fungible = [enrich_token(t, CURATED_CG) for t in fungible_raw]
fungible = [t for t in fungible if t["symbol"] and t["name"]
            and len(t["symbol"]) <= 25 and len(t["name"]) <= 80
            and not t["symbol"].startswith("LP_")]
print(f"  Cleaned fungible: {len(fungible)}")

# 2. NFT collections
print("\n[2] Fetching NFT collections (asc + desc)...")
nft_raw = fetch_all_tokens_both_orders("NON_FUNGIBLE_UNIQUE", pages_each=8)
nfts = [enrich_token(t, CURATED_CG) for t in nft_raw]
nfts = [t for t in nfts if t["symbol"] and t["name"] and len(t["symbol"]) <= 40]
print(f"  Cleaned NFTs: {len(nfts)}")

# 4. Save raw data
print("\n[3] Saving data...")
(OUT_DIR / "hedera-tokens-full.json").write_text(json.dumps(fungible, indent=2))
(OUT_DIR / "hedera-nfts-full.json").write_text(json.dumps(nfts, indent=2))
print(f"  Saved {len(fungible)} fungible tokens → training/hedera-tokens-full.json")
print(f"  Saved {len(nfts)} NFT collections  → training/hedera-nfts-full.json")

# 5. Generate expanded tokenRegistry.generated.ts
print("\n[4] Generating tokenRegistry.generated.ts...")

def ts_str(s):
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("`", "\\`")

lines = [
    "// AUTO-GENERATED by scripts/fetch-hedera-tokens.py — DO NOT EDIT MANUALLY",
    "// Run: python3 scripts/fetch-hedera-tokens.py",
    f"// Generated: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}",
    f"// Fungible tokens: {len(fungible)} | NFT collections: {len(nfts)}",
    "",
    "import type { KnownToken } from './tokenRegistry.js';",
    "",
    "export const GENERATED_TOKENS: KnownToken[] = [",
]

for t in fungible:
    cg = f", coingecko_id: '{ts_str(t['coingecko_id'])}'" if t.get("coingecko_id") else ""
    lines.append(
        f"  {{ token_id: '{t['token_id']}', symbol: '{ts_str(t['symbol'])}', "
        f"name: '{ts_str(t['name'])}', decimals: {t['decimals']}, "
        f"type: 'FUNGIBLE_COMMON'{cg} }},"
    )

lines += [
    "];",
    "",
    "export const GENERATED_NFTS: KnownToken[] = [",
]

for t in nfts:
    cg = f", coingecko_id: '{ts_str(t['coingecko_id'])}'" if t.get("coingecko_id") else ""
    lines.append(
        f"  {{ token_id: '{t['token_id']}', symbol: '{ts_str(t['symbol'])}', "
        f"name: '{ts_str(t['name'])}', decimals: {t['decimals']}, "
        f"type: 'NON_FUNGIBLE_UNIQUE'{cg} }},"
    )

lines += ["];", ""]

REGISTRY_OUT.write_text("\n".join(lines))
print(f"  Saved → {REGISTRY_OUT}")

# 6. Summary
print("\n" + "=" * 60)
print("  SUMMARY")
print("=" * 60)
print(f"  Fungible tokens : {len(fungible)}")
print(f"  NFT collections : {len(nfts)}")
print(f"  CoinGecko mapped: {sum(1 for t in fungible if t.get('coingecko_id'))}")
print(f"  NFTs w/ CoinGecko: {sum(1 for t in nfts if t.get('coingecko_id'))}")
print("=" * 60)
print("\nNext: run generate-training-data-v2.ts to create expanded dataset")
