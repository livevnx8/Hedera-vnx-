/**
 * create-vera-wallet.ts
 *
 * 🤖 Create Vera's own Hedera wallet
 *
 * Generates a fresh ED25519 keypair, submits AccountCreateTransaction
 * funded by the operator, and prints the new account ID + keys.
 *
 * Run:
 *   npm run create:vera-wallet
 *
 * Prerequisites in .env:
 *   HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxxxx
 *   HEDERA_OPERATOR_PRIVATE_KEY=302e...
 *   HEDERA_NETWORK=mainnet   (or testnet)
 */

import 'dotenv/config';
import { createHederaAccount } from '../src/hedera/hederaTxTools.js';
import { config } from '../src/config.js';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function checkConfig(): boolean {
  const missing: string[] = [];
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) missing.push('HEDERA_OPERATOR_ACCOUNT_ID');
  if (!config.HEDERA_OPERATOR_PRIVATE_KEY) missing.push('HEDERA_OPERATOR_PRIVATE_KEY');
  if (missing.length > 0) {
    console.error('\n❌  Missing required .env values:\n');
    missing.forEach(k => console.error(`   ${k}=`));
    console.error('\nFill these in .env and re-run.\n');
    return false;
  }
  return true;
}

function appendToEnv(accountId: string, privateKey: string, publicKey: string) {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const current = readFileSync(envPath, 'utf-8');
  if (current.includes('VERA_WALLET_ACCOUNT_ID')) {
    console.log('\n  ⚠️   VERA_WALLET_ACCOUNT_ID already exists in .env — not overwriting.');
    console.log('       Update manually if you want to replace it.\n');
    return;
  }

  const block = [
    '',
    '# Vera self-owned wallet (created by create-vera-wallet script)',
    `VERA_WALLET_ACCOUNT_ID=${accountId}`,
    `VERA_WALLET_PRIVATE_KEY=${privateKey}`,
    `VERA_WALLET_PUBLIC_KEY=${publicKey}`,
  ].join('\n');

  writeFileSync(envPath, current + block + '\n');
  console.log('\n  ✅  Appended VERA_WALLET_* keys to .env');
}

async function main() {
  if (!checkConfig()) process.exit(1);

  const net = config.HEDERA_NETWORK ?? 'mainnet';

  console.log('\n' + '═'.repeat(60));
  console.log('  🤖  Creating Vera\'s Own Hedera Wallet');
  console.log(`  Network  : ${net}`);
  console.log(`  Funded by: ${config.HEDERA_OPERATOR_ACCOUNT_ID}`);
  console.log(`  Seed     : 1 HBAR`);
  console.log('═'.repeat(60));
  console.log('\n  Generating ED25519 keypair and submitting transaction…\n');

  const result = await createHederaAccount({
    initialHbar: 1,
    memo: 'Vera.h — self-owned wallet',
  });

  console.log('  ✅  Wallet created!\n');
  console.log(`  Account ID : ${result.accountId}`);
  console.log(`  Status     : ${result.status}`);
  console.log(`  Tx ID      : ${result.txId}`);
  console.log(`\n  🔗  ${result.explorerUrl}`);

  console.log('\n' + '─'.repeat(60));
  console.log('  🔑  SAVE THESE KEYS — they will not be shown again:\n');
  console.log(`  Public Key  : ${result.publicKey}`);
  console.log(`  Private Key : ${result.privateKey}`);
  console.log('─'.repeat(60));

  appendToEnv(result.accountId, result.privateKey, result.publicKey);

  console.log('\n' + '═'.repeat(60));
  console.log('  Next steps:');
  console.log('  1. Vera now has her own account — ask her to check her balance');
  console.log('  2. Transfer VERA tokens to her wallet to give her spending power');
  console.log('  3. She can autonomously sign transactions using VERA_WALLET_PRIVATE_KEY');
  console.log('═'.repeat(60) + '\n');
}

main().catch(err => {
  console.error('\n❌  Wallet creation failed:', err.message ?? err);
  process.exit(1);
});
