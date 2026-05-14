/**
 * Vera In-House Hedera Wallet Generator
 * 
 * Usage:
 *   npx tsx scripts/create-wallet.ts                   # just generate a keypair
 *   npx tsx scripts/create-wallet.ts --create          # generate + create account on-chain (needs operator in .env)
 *   npx tsx scripts/create-wallet.ts --create --hbar 5 # fund new account with 5 HBAR from operator
 */

import * as dotenv from 'dotenv';
import { PrivateKey, Client, AccountCreateTransaction, Hbar, AccountId } from '@hashgraph/sdk';

dotenv.config();

const args = process.argv.slice(2);
const shouldCreate = args.includes('--create');
const hbarAmount = (() => {
  const idx = args.indexOf('--hbar');
  return idx !== -1 ? parseFloat(args[idx + 1] ?? '2') : 2;
})();

async function main() {
  console.log('\n=== Vera Hedera Wallet Generator ===\n');

  // Generate fresh ED25519 keypair
  const privateKey = PrivateKey.generateED25519();
  const publicKey = privateKey.publicKey;

  console.log('Generated keypair:');
  console.log('  Private key (DER):', privateKey.toString());
  console.log('  Private key (raw):', privateKey.toStringRaw());
  console.log('  Public key (DER): ', publicKey.toString());
  console.log('  Public key (raw): ', publicKey.toStringRaw());

  if (!shouldCreate) {
    console.log('\n── No account created yet ──');
    console.log('To create + fund an on-chain account, run:');
    console.log('  npx tsx scripts/create-wallet.ts --create --hbar 5');
    console.log('\nThis requires HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY');
    console.log('to be set in .env (any funded account works as the creator).\n');
    return;
  }

  // Create account on-chain
  const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    console.error('\n❌ HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY must be set in .env to create accounts on-chain.');
    console.error('Set any funded Hedera account as the temporary operator.\n');
    process.exit(1);
  }

  const network = (process.env.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
  const client = network === 'testnet' ? Client.forTestnet() : Client.forMainnet();
  // Auto-detect key format: DER prefix = fromStringDer, raw 64-char hex = try ECDSA first
  let opKey: PrivateKey;
  if (operatorKey.startsWith('302')) {
    opKey = PrivateKey.fromStringDer(operatorKey);
  } else if (operatorKey.length === 64) {
    try { opKey = PrivateKey.fromStringECDSA(operatorKey); }
    catch { opKey = PrivateKey.fromStringED25519(operatorKey); }
  } else {
    opKey = PrivateKey.fromString(operatorKey);
  }
  client.setOperator(AccountId.fromString(operatorId), opKey);

  console.log(`\nCreating account on ${network} with ${hbarAmount} HBAR initial balance...`);

  try {
    const tx = await new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(Hbar.fromTinybars(Math.round(hbarAmount * 1e8)))
      .setMaxAutomaticTokenAssociations(10)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const newAccountId = receipt.accountId!.toString();

    console.log('\n✅ Account created successfully!\n');
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log(`│ Account ID:   ${newAccountId.padEnd(51)} │`);
    console.log(`│ Private key:  ${privateKey.toString().substring(0, 51)} │`);
    console.log('│               (see full key above)                              │');
    console.log(`│ Network:      ${network.padEnd(51)} │`);
    console.log(`│ HashScan:     https://hashscan.io/${network}/account/${newAccountId.padEnd(20)} │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');

    console.log('\n── Add to your .env ──');
    console.log(`HEDERA_OPERATOR_ACCOUNT_ID=${newAccountId}`);
    console.log(`HEDERA_OPERATOR_PRIVATE_KEY=${privateKey.toString()}`);
    console.log('');

    client.close();
  } catch (err) {
    console.error('\n❌ Failed to create account:', err instanceof Error ? err.message : err);
    client.close();
    process.exit(1);
  }
}

main();
