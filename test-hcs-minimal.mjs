#!/usr/bin/env node
import { Client, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';

console.log('Testing HCS key loading...');
console.log('Account:', config.HEDERA_OPERATOR_ACCOUNT_ID);

const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';
console.log('Key length:', keyStr.length);
console.log('Key first 20 chars:', keyStr.substring(0, 20) + '...');

try {
  const client = Client.forMainnet();
  let privateKey;
  
  if (keyStr.length === 64) {
    try { 
      privateKey = PrivateKey.fromStringECDSA(keyStr); 
      console.log('✅ Loaded as ECDSA');
    }
    catch { 
      privateKey = PrivateKey.fromStringED25519(keyStr); 
      console.log('✅ Loaded as Ed25519');
    }
  } else {
    privateKey = PrivateKey.fromString(keyStr);
    console.log('✅ Loaded with fromString');
  }
  
  client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360', privateKey);
  console.log('✅ HCS Client initialized successfully!');
  
} catch (error) {
  console.log('❌ FAILED:', error.message);
  process.exit(1);
}
