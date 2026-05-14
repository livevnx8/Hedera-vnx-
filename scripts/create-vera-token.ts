/**
 * create-vera-token.ts
 *
 * 🤖 Deploy Vera's own HTS token on Hedera
 *
 *   Name    : Vera
 *   Symbol  : VERA
 *   Supply  : 1,000,000,000 (infinite mint via supply key)
 *   Decimals: 8
 *   Treasury: HEDERA_OPERATOR_ACCOUNT_ID (Vera's own account)
 *   Admin   : HEDERA_OPERATOR_ACCOUNT_ID
 *
 * Run:
 *   npm run create:vera-token
 *
 * Prerequisites in .env:
 *   HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxxxx
 *   HEDERA_OPERATOR_PRIVATE_KEY=302e...
 *   HEDERA_NETWORK=mainnet   (or testnet)
 */

import 'dotenv/config';
import { createHtsToken } from '../src/hedera/hederaTxTools.js';
import { config } from '../src/config.js';

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

async function main() {
  if (!checkConfig()) process.exit(1);

  const net = config.HEDERA_NETWORK ?? 'mainnet';

  console.log('\n' + '═'.repeat(58));
  console.log('  🤖  Vera HTS Token Deployment');
  console.log(`  Network  : ${net}`);
  console.log(`  Treasury : ${config.HEDERA_OPERATOR_ACCOUNT_ID}`);
  console.log('═'.repeat(58));
  console.log('  Name     : Vera');
  console.log('  Symbol   : VERA');
  console.log('  Decimals : 8');
  console.log('  Supply   : 1,000,000,000 VERA  (infinite mint)');
  console.log('  Admin    : operator account');
  console.log('═'.repeat(58));
  console.log('\n  Submitting token creation transaction…\n');

  const result = await createHtsToken({
    name:          'Vera',
    symbol:        'VERA',
    decimals:      8,
    initialSupply: 1_000_000_000,
    memo:          'Vera.h native token — powered by QVX on Hedera',
  });

  console.log(`  ✅  Token created!`);
  console.log(`  Token ID  : ${result.tokenId}`);
  console.log(`  Tx ID     : ${result.txId}`);
  console.log(`  Status    : ${result.status}`);
  console.log(`\n  🔗  ${result.explorerUrl}`);
  console.log('\n' + '═'.repeat(58));
  console.log('  Next steps:');
  console.log(`  1. Add  VERA_TOKEN_ID=${result.tokenId}  to .env`);
  console.log('  2. Associate wallets using hedera_associate_token');
  console.log('  3. Ask Vera to transfer VERA tokens via chat');
  console.log('═'.repeat(58) + '\n');
}

main().catch(err => {
  console.error('\n❌  Token creation failed:', err.message ?? err);
  process.exit(1);
});
