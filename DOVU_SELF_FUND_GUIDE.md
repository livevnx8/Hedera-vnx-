# Self-Funded DOVU Treasury - Quick Start

## Current Status
- Treasury Account: `0.0.10294360`
- Current DOVU Balance: **0 DOVU**
- System: Ready to receive and distribute

## Step 1: Buy DOVU Tokens

### Option A: SaucerSwap (Fastest)
1. Go to: https://www.saucerswap.finance
2. Connect your Hedera wallet (Hashpack, Blade, etc.)
3. Make sure you have HBAR in your wallet
4. Swap HBAR → DOVU
5. Tokens arrive in your wallet automatically

### Option B: Hashport (From Ethereum)
1. Go to: https://app.hashport.network
2. Connect Ethereum wallet (MetaMask)
3. Select DOVU token
4. Bridge to Hedera
5. Destination: Your Hedera account `0.0.10294360`

## Step 2: Verify DOVU Received

Check your balance on HashScan:
https://hashscan.io/mainnet/account/0.0.10294360

Or run:
```bash
curl -X GET "https://mainnet.mirrornode.hedera.com/api/v1/accounts/0.0.10294360" | grep -A 5 "tokens"
```

## Step 3: Start Earning

Once you have DOVU (100+ recommended):

```bash
# Start 24/7 live dominance with self-funded treasury
npx tsx scripts/vera-dovu-self-funded.ts
```

## How It Works

1. **You fund treasury** with DOVU tokens
2. **Vera verifies** carbon credits
3. **Treasury pays you** 5 DOVU per verification
4. **You earn continuously** 24/7

## Economics

- **Cost per verification**: 5 DOVU
- **Your earnings per verification**: 5 DOVU (transferred from treasury to you)
- **Break even**: After verifying the amount you funded
- **Profit**: Scale beyond your initial funding

## Recommended Funding Amounts

| Initial DOVU | Verifications Funded | Earnings Potential |
|--------------|---------------------|-------------------|
| 50 DOVU      | 10 verifications    | Scale to 100+ |
| 100 DOVU     | 20 verifications    | Scale to 500+ |
| 500 DOVU     | 100 verifications   | Scale to 5000+ |
| 1000 DOVU    | 200 verifications   | Unlimited |

## What Happens

1. Vera verifies carbon credit
2. System transfers 5 DOVU from treasury → your wallet
3. You earn DOVU for every verification
4. Scale continuously

## Ready to Start?

1. Buy DOVU on SaucerSwap
2. Transfer to: `0.0.10294360`
3. Run: `npx tsx scripts/vera-dovu-self-funded.ts`
4. Start earning 24/7!

## Support

- DOVU Token ID: `0.0.1329002`
- Treasury Account: `0.0.10294360`
- SaucerSwap: https://www.saucerswap.finance
