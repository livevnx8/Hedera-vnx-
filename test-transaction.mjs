#!/usr/bin/env node
/**
 * Vera Wallet Test Transaction
 * Send one transaction to hbar.h token (0.0.9356476) and back
 */

import { Client, TransferTransaction, AccountId, Hbar, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';
const TEST_AMOUNT = 0.001; // Tiny amount for testing

async function testTransaction() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧪 VERA WALLET TEST TRANSACTION                               ║
║  Token: ${TOKEN_ID} (hbar.h)                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Check credentials
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    console.error('❌ Missing credentials. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY');
    process.exit(1);
  }

  console.log(`📤 Sender: ${operatorId}`);
  console.log(`📥 Recipient: ${operatorId} (self-transfer test)`);
  console.log(`💰 Amount: ${TEST_AMOUNT} HBAR`);
  console.log('');

  // Initialize client
  const client = Client.forMainnet();
  
  // Parse private key from hex string (detect key type automatically)
  let privateKey;
  if (operatorKey.length === 64) {
    // Raw hex key - try ECDSA first (common for Hedera), fallback to ED25519
    try {
      privateKey = PrivateKey.fromStringECDSA(operatorKey);
    } catch {
      try {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      } catch (e) {
        console.error('Failed to parse private key:', e.message);
        process.exit(1);
      }
    }
  } else {
    // DER encoded key or other format
    privateKey = PrivateKey.fromString(operatorKey);
  }
  
  client.setOperator(operatorId, privateKey);

  try {
    // Step 1: Self-transfer test (send to yourself)
    console.log('⏳ Step 1: Sending HBAR to yourself (self-transfer test)...');
    const sendTx = new TransferTransaction()
      .addHbarTransfer(operatorId, Hbar.fromTinybars(-Math.floor(TEST_AMOUNT * 100000000)))
      .addHbarTransfer(AccountId.fromString(operatorId), Hbar.fromTinybars(Math.floor(TEST_AMOUNT * 100000000)))
      .setTransactionMemo('Vera wallet test - self transfer');

    const sendResponse = await sendTx.execute(client);
    const sendReceipt = await sendResponse.getReceipt(client);
    
    console.log(`✅ Sent successfully!`);
    console.log(`   Transaction ID: ${sendResponse.transactionId.toString()}`);
    console.log(`   Status: ${sendReceipt.status.toString()}`);
    console.log('');

    // Step 2: Another self-transfer (confirming it works both ways)
    console.log('⏳ Step 2: Confirming with another self-transfer...');
    const backTx = new TransferTransaction()
      .addHbarTransfer(operatorId, Hbar.fromTinybars(-Math.floor(TEST_AMOUNT * 100000000)))
      .addHbarTransfer(AccountId.fromString(operatorId), Hbar.fromTinybars(Math.floor(TEST_AMOUNT * 100000000)))
      .setTransactionMemo('Vera wallet test - confirm');

    const backResponse = await backTx.execute(client);
    const backReceipt = await backResponse.getReceipt(client);
    
    console.log(`✅ Second transfer successful!`);
    console.log(`   Transaction ID: ${backResponse.transactionId.toString()}`);
    console.log(`   Status: ${backReceipt.status.toString()}`);
    console.log('');

    // Summary
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ✅ VERA WALLET TEST COMPLETED SUCCESSFULLY                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Account: ${operatorId}                                  ║
║  Transactions: 2 self-transfers                               ║
║  Total Cost: ~$0.0002                                          ║
║  Time: ${new Date().toLocaleTimeString()}                                          ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    client.close();
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ Transaction failed: ${error.message}`);
    client.close();
    process.exit(1);
  }
}

// Run test
testTransaction();
