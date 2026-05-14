/**
 * DOVU Token Claim Configuration
 * 
 * To actually receive DOVU tokens, configure these in your .env:
 */

// Option 1: Use DOVU Payment Contract (Recommended)
// Deploy a smart contract that holds DOVU and releases to verifiers
DOVU_PAYMENT_CONTRACT_ID=0.0.xxxxx

// Option 2: Treasury Account (Manual)
// An account that holds DOVU tokens and sends to Vera
DOVU_TREASURY_ACCOUNT_ID=0.0.xxxxx
DOVU_TREASURY_PRIVATE_KEY=xxxx

// Option 3: Direct from DOVU Foundation
// Contact DOVU to add your operator account as a verified verifier
// They can send tokens directly to: 0.0.10294360

/**
 * Current Setup Status:
 * - Verifications: 50 complete ✓
 * - Earnings tracked: 30 DOVU ✓
 * - Token balance: 0 DOVU (needs funding)
 * 
 * Next steps:
 * 1. Get DOVU tokens from faucet/market
 * 2. Or contact DOVU foundation for verifier rewards
 * 3. Deploy payment contract (optional)
 * 4. Re-run auto-dominance to claim
 */
