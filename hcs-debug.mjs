#!/usr/bin/env node
/**
 * Quick HCS Test - Check why topics aren't creating
 */

import { Client, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const WALLET = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY || '';

console.log('HCS DEBUG TEST');
console.log('==============\n');

console.log('1. Key Length:', keyStr.length);
console.log('2. Key Start:', keyStr.slice(0, 16) + '...');

try {
  let pk;
  if (keyStr.length === 64) {
    try { pk = PrivateKey.fromStringECDSA(keyStr); console.log('3. Key Type: ECDSA'); }
    catch { pk = PrivateKey.fromStringED25519(keyStr); console.log('3. Key Type: ED25519'); }
  } else {
    pk = PrivateKey.fromString(keyStr);
    console.log('3. Key Type: Auto');
  }
  
  const client = Client.forMainnet();
  client.setOperator(WALLET, pk);
  console.log('4. Client: OK');
  console.log('\n✅ All checks passed - HCS should work');
} catch (e) {
  console.log('❌ Error:', e.message);
}
