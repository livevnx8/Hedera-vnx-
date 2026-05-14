#!/usr/bin/env node
/**
 * Quick test to verify agent credential loading
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('=== Environment Check ===');
console.log('HEDERA_OPERATOR_ACCOUNT_ID:', process.env.HEDERA_OPERATOR_ACCOUNT_ID);
console.log('HEDERA_OPERATOR_PRIVATE_KEY exists:', !!process.env.HEDERA_OPERATOR_PRIVATE_KEY);
console.log('HEDERA_ACCOUNT_ID:', process.env.HEDERA_ACCOUNT_ID);
console.log('HEDERA_PRIVATE_KEY exists:', !!process.env.HEDERA_PRIVATE_KEY);

// Test agent config loading
import { createAgentConfig } from './templates/agentRegistry.mjs';

const config = createAgentConfig('healthcare-supply', { id: 'test-agent' });
console.log('\n=== Agent Config ===');
console.log('Credentials accountId:', config.credentials?.accountId);
console.log('Credentials privateKey exists:', !!config.credentials?.privateKey);
