#!/usr/bin/env node
/**
 * Debug test for agent credential loading
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('=== Agent Environment Debug ===');
console.log('HEDERA_ACCOUNT_ID:', process.env.HEDERA_ACCOUNT_ID || 'NOT SET');
console.log('HEDERA_OPERATOR_ACCOUNT_ID:', process.env.HEDERA_OPERATOR_ACCOUNT_ID || 'NOT SET');
console.log('HEDERA_PRIVATE_KEY:', process.env.HEDERA_PRIVATE_KEY ? 'SET' : 'NOT SET');
console.log('HEDERA_OPERATOR_PRIVATE_KEY:', process.env.HEDERA_OPERATOR_PRIVATE_KEY ? 'SET' : 'NOT SET');
console.log('All env vars starting with HEDERA:', Object.keys(process.env).filter(k => k.startsWith('HEDERA')));
