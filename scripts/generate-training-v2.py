#!/usr/bin/env python3
"""
Generate expanded Vera fine-tuning dataset from full Hedera token list.
Covers: fungible tokens, NFTs, searches, prices, account queries, DeFi.
Output: training/vera-ft-v2-train.jsonl  (~2000+ examples)
        training/vera-ft-v2-eval.jsonl   (~100 examples)
"""

import json, random, re
from pathlib import Path

TRAINING_DIR = Path(__file__).parent.parent / "training"
TOKENS_FILE  = TRAINING_DIR / "hedera-tokens-full.json"
NFTS_FILE    = TRAINING_DIR / "hedera-nfts-full.json"
OUT_TRAIN    = TRAINING_DIR / "vera-ft-v2-train.jsonl"
OUT_EVAL     = TRAINING_DIR / "vera-ft-v2-eval.jsonl"

random.seed(42)

# ── Load token data ────────────────────────────────────────────────────────────

fungible = json.loads(TOKENS_FILE.read_text())
nfts     = json.loads(NFTS_FILE.read_text())

# Filter out garbage tokens
def clean_symbol(s): return re.match(r'^[A-Za-z0-9\[\]._\-ℏ#@!$%^&*()+<>?/|~,;:\'\"]{1,25}$', s or '') is not None
def clean_name(s):   return bool(s) and len(s) >= 2 and len(s) <= 80

fungible = [t for t in fungible if clean_symbol(t['symbol']) and clean_name(t['name'])]
nfts     = [t for t in nfts     if clean_symbol(t['symbol']) and clean_name(t['name'])]

print(f"Loaded {len(fungible)} fungible, {len(nfts)} NFT collections")

# ── System prompt (matches training format) ────────────────────────────────────

SYSTEM = """You are Vera, an elite AI built on the Hedera network and powered by the QVX node. You are purpose-built for Hedera blockchain intelligence, advanced reasoning, and real-time on-chain operations.

You have deep expertise in Hedera Hashgraph (HBAR, HTS tokens, HCS consensus messaging), QVX trading intelligence, blockchain engineering, and DeFi.

## Tool Call Format

When you need live on-chain data, output ONLY the tool call JSON — no explanation before it:
{"name": "tool_name", "arguments": {"param": "value"}}

The result will be returned in a <tool_response> block. Then incorporate it into your answer.

## Critical Rules
- ALWAYS call hedera_search_tokens when a user mentions a token by name or symbol you don't have the ID for.
- NEVER guess token IDs, balances, or transaction data — use tools.
- For write operations (transfers, mints, swaps), tell the user what you're about to do and submit the transaction for their approval.
- Be direct and precise. No filler, no hedging."""

def msg(role, content): return {"role": role, "content": content}
def ex(*messages):      return {"messages": [msg("system", SYSTEM)] + list(messages)}

# ── Template generators ────────────────────────────────────────────────────────

def token_info_response(t):
    lines = [f"**{t['symbol']}** ({t['name']})", f"- Token ID: `{t['token_id']}`", f"- Decimals: {t['decimals']}", f"- Type: {t['type'].replace('_', ' ').title()}"]
    if t.get('coingecko_id'):
        lines.append(f"- CoinGecko: `{t['coingecko_id']}`")
    return "\n".join(lines)

def nft_info_response(t):
    return f"**{t['name']}** ({t['symbol']})\n- Collection ID: `{t['token_id']}`\n- Type: NFT Collection (NON_FUNGIBLE_UNIQUE)\n- Decimals: 0"

def search_response(t, is_nft=False):
    type_label = "NFT collection" if is_nft else "fungible HTS token"
    return json.dumps([{
        "token_id": t["token_id"], "name": t["name"], "symbol": t["symbol"],
        "type": t["type"], "decimals": t["decimals"],
        **({"coingecko_id": t["coingecko_id"]} if t.get("coingecko_id") else {}),
    }], indent=2)

# ── Query variants ─────────────────────────────────────────────────────────────

TOKEN_ID_QUERIES = [
    "what is the token ID for {sym}?",
    "what's the token ID of {sym} on hedera?",
    "hedera token ID for {name}",
    "what is {sym}'s token ID?",
    "find the hedera token ID for {sym}",
    "what is the contract address for {name}?",
    "token id: {sym}",
    "lookup {sym} token",
    "{sym} token ID hedera mainnet",
    "HTS token ID for {sym}",
    "what is the {sym} token address?",
    "tell me about {sym} on hedera",
    "info about {name} token",
    "{sym} — what's its hedera token ID?",
    "I need the token ID for {name}",
]

NFT_QUERIES = [
    "what is the collection ID for {name} NFTs?",
    "NFT collection ID for {sym}",
    "tell me about the {name} collection",
    "what's the token ID for the {sym} NFT collection?",
    "find the {name} NFT collection",
    "{sym} NFT — collection info",
    "hedera NFT collection: {name}",
    "what is the {sym} NFT collection address?",
    "I'm looking for the {name} collection on Hedera",
    "lookup NFT collection {sym}",
]

SEARCH_QUERIES = [
    "search for {sym} token",
    "find token {sym}",
    "look up {sym} on hedera",
    "search hedera for {name}",
    "is there a token called {name}?",
    "find {sym} HTS token",
    "what tokens are called {sym}?",
    "search: {sym}",
    "hedera search {name}",
    "find me the {sym} token details",
]

PRICE_QUERIES = [
    "what's the price of {sym}?",
    "how much is {sym} worth?",
    "current {sym} price",
    "{sym} price in USD",
    "what is {sym} trading at?",
    "price check {sym}",
    "{sym} current value",
    "how much does {sym} cost?",
    "{sym} price on saucerswap",
    "live price of {sym}",
]

ACCOUNT_QUERIES = [
    "what tokens does account {acc} hold?",
    "show me the HTS tokens for {acc}",
    "token balances for account {acc}",
    "what's in account {acc}?",
    "list tokens held by {acc}",
    "{acc} token holdings",
    "check {acc} for HTS tokens",
    "what HTS tokens does {acc} have?",
    "token portfolio for {acc}",
]

def rand_account():
    return f"0.0.{random.randint(100000, 9999999)}"

def rand_token_balance(symbol, decimals):
    raw = random.randint(100, 1_000_000) * (10 ** decimals)
    display = raw / (10 ** decimals)
    return raw, display

# ── Fake data for tool responses ──────────────────────────────────────────────

def fake_account_response(acc, tokens_held):
    result = {
        "account": acc,
        "balance": {"hbars": round(random.uniform(10, 50000), 4)},
        "tokens": [{"token_id": t["token_id"], "symbol": t["symbol"],
                    "balance": random.randint(1, 100) * (10 ** t["decimals"])}
                   for t in tokens_held]
    }
    return json.dumps(result, indent=2)

def fake_price_response(t):
    return json.dumps({
        "tokenId": t["token_id"], "symbol": t["symbol"],
        "priceUsd": round(random.uniform(0.001, 5.0), 8),
        "priceHbar": round(random.uniform(0.01, 100), 6),
    }, indent=2)

# ── Build examples ─────────────────────────────────────────────────────────────

examples = []

# 1. Direct token ID knowledge (curated tokens — model should know these)
CURATED = [
    {"token_id": "0.0.1456986", "symbol": "WHBAR",   "name": "Wrapped HBAR",          "decimals": 8,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.834116",  "symbol": "HBARX",   "name": "HBARX",                 "decimals": 8,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.731861",  "symbol": "SAUCE",   "name": "SaucerSwap",            "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.1460200", "symbol": "XSAUCE",  "name": "xSAUCE",               "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.7893707", "symbol": "GIB",     "name": "༼ つ ◕_◕ ༽つ",          "decimals": 0,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.7894159", "symbol": "DOSA",    "name": "Dosa the Demon",        "decimals": 0,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.456858",  "symbol": "USDC",    "name": "USD Coin",              "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.1055472", "symbol": "USDT",    "name": "Tether USD",            "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.2283230", "symbol": "KARATE",  "name": "Karate Combat",         "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.859814",  "symbol": "CLXY",    "name": "Calaxy",                "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.8279134", "symbol": "BONZO",   "name": "Bonzo Finance",         "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.5989978", "symbol": "KBL",     "name": "Kabila",                "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.3716059", "symbol": "DOVU",    "name": "DOVU",                  "decimals": 8,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.127877",  "symbol": "JAM",     "name": "Tune.Fm",               "decimals": 8,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.968069",  "symbol": "HST",     "name": "HeadStarter",           "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.10282787","symbol": "USDT0",   "name": "USDT0",                 "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.7893551", "symbol": "FINS",    "name": "FINS",                  "decimals": 0,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.7907968", "symbol": "DINO",    "name": "DINO",                  "decimals": 0,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.7974354", "symbol": "LEEMON",  "name": "LeemonHead",            "decimals": 0,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.9632905", "symbol": "JEET",    "name": "Jeeteroo",              "decimals": 0,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.8105204", "symbol": "IVY",     "name": "IVY",                   "decimals": 6,  "type": "FUNGIBLE_COMMON"},
    {"token_id": "0.0.4816828", "symbol": "HBARBARIAN","name": "HBARbarian",          "decimals": 0,  "type": "FUNGIBLE_COMMON"},
]

# Each curated token gets multiple direct knowledge examples
for t in CURATED:
    for _ in range(4):
        q = random.choice(TOKEN_ID_QUERIES).format(sym=t["symbol"], name=t["name"])
        examples.append(ex(
            msg("user", q),
            msg("assistant", token_info_response(t)),
        ))

# 2. Tool-call search for all fungible tokens (sample 600)
sample_fungible = random.sample(fungible, min(600, len(fungible)))
for t in sample_fungible:
    # search query → tool call → result
    q = random.choice(SEARCH_QUERIES + TOKEN_ID_QUERIES).format(sym=t["symbol"], name=t["name"])
    tool_args = {"query": t["symbol"]}
    tool_result = search_response(t)
    answer = token_info_response(t)
    examples.append(ex(
        msg("user", q),
        msg("assistant", json.dumps({"name": "hedera_search_tokens", "arguments": tool_args})),
        msg("user", f"<tool_response>\n{tool_result}\n</tool_response>"),
        msg("assistant", answer),
    ))

# 3. Tool-call search for NFT collections (sample 300)
sample_nfts = random.sample(nfts, min(300, len(nfts)))
for t in sample_nfts:
    q = random.choice(NFT_QUERIES + SEARCH_QUERIES).format(sym=t["symbol"], name=t["name"])
    tool_args = {"query": t["name"]}
    tool_result = json.dumps([{
        "token_id": t["token_id"], "name": t["name"], "symbol": t["symbol"],
        "type": "NON_FUNGIBLE_UNIQUE", "decimals": 0,
    }], indent=2)
    answer = nft_info_response(t)
    examples.append(ex(
        msg("user", q),
        msg("assistant", json.dumps({"name": "hedera_search_tokens", "arguments": tool_args})),
        msg("user", f"<tool_response>\n{tool_result}\n</tool_response>"),
        msg("assistant", answer),
    ))

# 4. Price queries (sample 200 tokens with prices)
sample_price = random.sample(fungible[:400], min(200, len(fungible)))
for t in sample_price:
    q = random.choice(PRICE_QUERIES).format(sym=t["symbol"])
    price_result = fake_price_response(t)
    price_data = json.loads(price_result)
    answer = f"**{t['symbol']}** current price:\n- **${price_data['priceUsd']:.8f} USD**\n- **{price_data['priceHbar']:.6f} HBAR**\n\nToken ID: `{t['token_id']}`"
    examples.append(ex(
        msg("user", q),
        msg("assistant", json.dumps({"name": "saucerswap_get_token_price", "arguments": {"token_id": t["token_id"]}})),
        msg("user", f"<tool_response>\n{price_result}\n</tool_response>"),
        msg("assistant", answer),
    ))

# 5. Account token queries (200 examples)
for _ in range(200):
    acc = rand_account()
    n_tokens = random.randint(0, 4)
    held = random.sample(fungible[:100], n_tokens) if n_tokens > 0 else []
    q = random.choice(ACCOUNT_QUERIES).format(acc=acc)
    tool_result = json.dumps(
        [{"token_id": h["token_id"], "symbol": h["symbol"],
          "balance": random.randint(1, 10000) * (10 ** h["decimals"])} for h in held]
    , indent=2)
    if held:
        token_list = "\n".join([f"- **{h['symbol']}** (`{h['token_id']}`)" for h in held])
        answer = f"Account **{acc}** holds {len(held)} HTS token(s):\n{token_list}"
    else:
        answer = f"Account **{acc}** holds **no HTS tokens**."
    examples.append(ex(
        msg("user", q),
        msg("assistant", json.dumps({"name": "hedera_get_tokens", "arguments": {"account_id": acc}})),
        msg("user", f"<tool_response>\n{tool_result}\n</tool_response>"),
        msg("assistant", answer),
    ))

# 6. Multi-token knowledge questions (what are the main Hedera DeFi tokens, etc.)
ECOSYSTEM_QA = [
    ("what are the main DeFi tokens on hedera?",
     "The core Hedera DeFi tokens:\n- **SAUCE** (`0.0.731861`) — SaucerSwap DEX governance\n- **XSAUCE** (`0.0.1460200`) — Staked SAUCE\n- **WHBAR** (`0.0.1456986`) — Wrapped HBAR (SaucerSwap LP pairs)\n- **HBARX** (`0.0.834116`) — Liquid staked HBAR\n- **BONZO** (`0.0.8279134`) — Bonzo Finance lending\n- **HLQT** (`0.0.6070128`) — Hedera Liquity protocol"),
    ("what stablecoins are on hedera?",
     "Stablecoins on Hedera mainnet:\n- **USDC** (`0.0.456858`) — Native USD Coin\n- **USDC[HTS]** (`0.0.1055459`) — Hashport Bridged USDC\n- **USDT[HTS]** (`0.0.1055472`) — Hashport Bridged USDT\n- **DAI[HTS]** (`0.0.1055477`) — Hashport Bridged DAI\n- **USDT0** (`0.0.10282787`) — USDT0\n- **HCHF** (`0.0.6070123`) — Hedera Swiss Franc\n- **XSGD** (`0.0.1985922`) — Singapore Dollar"),
    ("what wrapped tokens exist on hedera?",
     "Wrapped/bridged tokens on Hedera (via Hashport bridge):\n- **WHBAR** (`0.0.1456986`) — Wrapped HBAR\n- **WBTC[HTS]** (`0.0.1055483`) — Wrapped Bitcoin\n- **LINK[HTS]** (`0.0.1055495`) — Chainlink\n- **WAVAX[HTS]** (`0.0.1157020`) — Wrapped AVAX\n- **QNT[HTS]** (`0.0.1304757`) — Quant Network\n- **DAI[HTS]** (`0.0.1055477`) — DAI"),
    ("what meme coins are on hedera?",
     "Hedera meme/community tokens:\n- **GIB** (`0.0.7893707`) — ༼ つ ◕_◕ ༽つ\n- **DOSA** (`0.0.7894159`) — Dosa the Demon\n- **STICKBUG** (`0.0.4352885`) — stickbug\n- **SAUCEINU** (`0.0.2964435`) — Sauce Inu\n- **LEEMON** (`0.0.7974354`) — LeemonHead\n- **DINO** (`0.0.7907968`) — DINO\n- **FINS** (`0.0.7893551`) — FINS\n- **HBARBARIAN** (`0.0.4816828`) — HBARbarian\n- **MFM** (`0.0.4599983`) — Meme Millionaires"),
    ("what is HBAR?",
     "**HBAR** is the native cryptocurrency of the Hedera Hashgraph network.\n- Used for transaction fees, network services, and staking\n- Not an HTS token — it's the native coin (no token_id)\n- Current supply: ~50 billion HBAR\n- Ticker: HBAR on all major exchanges\n- CoinGecko: `hedera-hashgraph`"),
    ("what is saucerswap?",
     "**SaucerSwap** is the leading DEX (decentralized exchange) on Hedera.\n- Token: **SAUCE** (`0.0.731861`), 6 decimals\n- Staked token: **xSAUCE** (`0.0.1460200`)\n- Uses **WHBAR** (`0.0.1456986`) as the wrapped HBAR in LP pairs\n- Supports HBAR/HTS token pools with concentrated liquidity"),
    ("explain HBARX",
     "**HBARX** (`0.0.834116`) is a liquid staking token on Hedera issued by Stader Labs.\n- Stake HBAR → receive HBARX (accrues staking rewards)\n- 8 decimals\n- Redeemable 1:1+ for HBAR (ratio increases as rewards accrue)\n- CoinGecko: `hbarx`"),
    ("what is bonzo finance?",
     "**Bonzo Finance** is a lending and borrowing protocol on Hedera.\n- Token: **BONZO** (`0.0.8279134`), 6 decimals\n- Allows supplying and borrowing HTS tokens as collateral\n- CoinGecko: `bonzo-finance`"),
    ("what NFT collections exist on hedera?",
     "Hedera has hundreds of NFT collections minted as NON_FUNGIBLE_UNIQUE HTS tokens. Use the `hedera_search_tokens` tool to find specific collections by name or symbol. Major collections include various art, gaming, and PFP projects launched on Hedera mainnet."),
    ("how do decimals work for HTS tokens?",
     "HTS token decimals define the smallest divisible unit:\n- **decimals: 0** — whole units only (e.g. GIB, DOSA, NFTs)\n- **decimals: 6** — millionths (e.g. SAUCE, USDC — divide balance by 10⁶)\n- **decimals: 8** — hundred-millionths (e.g. HBARX, JAM — divide by 10⁸)\n- **decimals: 18** — wei-scale (bridged ETH assets like DAI[HTS])\n\nAll on-chain balances are stored as integers. To get the display value: `balance / 10^decimals`"),
    ("what is the hedera mirror node?",
     "The **Hedera Mirror Node** provides read-only REST API access to historical and real-time Hedera network data:\n- Base URL: `https://mainnet-public.mirrornode.hedera.com`\n- Endpoints: `/api/v1/tokens`, `/api/v1/accounts/{id}`, `/api/v1/transactions`\n- No API key required for public endpoints\n- Rate limits apply on the public node"),
    ("what is hedera token service (HTS)?",
     "**Hedera Token Service (HTS)** is Hedera's native token layer:\n- Create fungible tokens (like ERC-20) or NFTs (like ERC-721) without smart contracts\n- Token IDs format: `0.0.XXXXXX` (realm.shard.num)\n- Extremely low fees (~$0.001 per operation)\n- Supports custom fees, KYC, freeze/wipe/pause operations natively\n- Faster than EVM-based tokens: finality in ~3-5 seconds"),
]

for q, a in ECOSYSTEM_QA:
    for _ in range(3):  # 3 copies for reinforcement
        examples.append(ex(msg("user", q), msg("assistant", a)))

# 7. Token NOT found examples
NOT_FOUND_TOKENS = ["FAKECOIN", "XYZ123", "NOTREAL", "TESTTOKEN", "MOON2025", "RUGPULL"]
for sym in NOT_FOUND_TOKENS:
    q = random.choice(SEARCH_QUERIES).format(sym=sym, name=sym + " token")
    examples.append(ex(
        msg("user", q),
        msg("assistant", json.dumps({"name": "hedera_search_tokens", "arguments": {"query": sym}})),
        msg("user", f"<tool_response>\n[]\n</tool_response>"),
        msg("assistant", f"No token named **{sym}** was found on Hedera mainnet. It may not exist, or the symbol might be different. Try searching with a different query."),
    ))

# 8. Token ID format questions
examples += [
    ex(msg("user", "what format are hedera token IDs?"),
       msg("assistant", "Hedera token IDs use the format `realm.shard.num` — always `0.0.XXXXXX` on mainnet. Examples: `0.0.731861` (SAUCE), `0.0.456858` (USDC), `0.0.834116` (HBARX). The number after `0.0.` is a sequential integer assigned at token creation.")),
    ex(msg("user", "is 0.0.731861 sauce?"),
       msg("assistant", "Yes — `0.0.731861` is the token ID for **SAUCE** (SaucerSwap), the governance token of the SaucerSwap DEX on Hedera. It has 6 decimals.")),
    ex(msg("user", "what token is 0.0.456858?"),
       msg("assistant", "`0.0.456858` is **USDC** (USD Coin) on Hedera — the native USD stablecoin issued directly on Hedera HTS. 6 decimals.")),
    ex(msg("user", "what token is 0.0.834116?"),
       msg("assistant", "`0.0.834116` is **HBARX** — the liquid staking token for HBAR issued by Stader Labs. Stake HBAR to receive HBARX which accrues staking rewards. 8 decimals.")),
]

# ── Shuffle and split ──────────────────────────────────────────────────────────

random.shuffle(examples)
eval_size  = min(100, len(examples) // 20)
eval_set   = examples[:eval_size]
train_set  = examples[eval_size:]

print(f"Total examples: {len(examples)}")
print(f"Train: {len(train_set)}  |  Eval: {len(eval_set)}")

OUT_TRAIN.write_text("\n".join(json.dumps(e) for e in train_set))
OUT_EVAL.write_text("\n".join(json.dumps(e) for e in eval_set))

print(f"Saved → {OUT_TRAIN} ({len(train_set)} examples)")
print(f"Saved → {OUT_EVAL}  ({len(eval_set)} examples)")

# Token coverage stats
total_tokens_covered = len(sample_fungible) + len(sample_nfts) + len(CURATED)
print(f"\nToken coverage: {total_tokens_covered} unique tokens + {len(nfts[:300])} NFT collections")
print(f"Total Hedera tokens in registry: {len(fungible)} fungible + {len(nfts)} NFT")
