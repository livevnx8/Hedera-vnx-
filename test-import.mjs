#!/usr/bin/env node
console.log('Step 1: Starting');

console.log('Step 2: Importing Hedera SDK...');
const { Client } = await import('@hashgraph/sdk');
console.log('Step 3: Hedera SDK OK');

console.log('Step 4: Creating client...');
const client = Client.forMainnet();
console.log('Step 5: Client created');

console.log('Step 6: Importing HCSLogger...');
const { HCSLogger } = await import('./blueprints/hcs-logger.mjs');
console.log('Step 7: HCSLogger imported');

console.log('Step 8: Creating logger...');
const logger = new HCSLogger(client, { CORE: '0.0.10409351' });
console.log('Step 9: Logger created');

console.log('Step 10: All done!');
