/**
 * Test Payment Script - 1 HBAR Round Trip
 * 
 * Sends 1 HBAR from operator to each revenue account,
 * then sends 1 HBAR back to operator.
 * Verifies payment system works correctly.
 */

import { 
  TransferTransaction, 
  Hbar,
  Client 
} from '@hashgraph/sdk';
import { getClient } from './dist/hedera/tools/client.js';
import { logger } from './dist/monitoring/logger.js';

// Revenue accounts
const ACCOUNTS = {
  operator: '0.0.10294360',
  treasury: '0.0.10414504',
  operations: '0.0.10414505',
  reserve: '0.0.10414506',
};

const TEST_AMOUNT = 1; // 1 HBAR

async function testPaymentRoundTrip() {
  console.log('💰 Testing 1 HBAR Payment Round Trip\n');
  console.log('=====================================\n');
  
  const client = getClient();
  const results = [];
  
  // Test 1: Operator → Treasury
  console.log('1️⃣  Sending 1 HBAR to Treasury...');
  try {
    const tx1 = new TransferTransaction()
      .addHbarTransfer(ACCOUNTS.operator, Hbar.from(-TEST_AMOUNT))
      .addHbarTransfer(ACCOUNTS.treasury, Hbar.from(TEST_AMOUNT))
      .setTransactionMemo('Test: Operator → Treasury');
    
    const response1 = await tx1.execute(client);
    const receipt1 = await response1.getReceipt(client);
    
    results.push({
      test: 'Operator → Treasury',
      status: receipt1.status.toString(),
      txId: response1.transactionId?.toString(),
    });
    console.log(`   ✅ Success! Tx: ${response1.transactionId?.toString()}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
    results.push({ test: 'Operator → Treasury', status: 'FAILED', error: error.message });
  }
  
  // Test 2: Operator → Operations
  console.log('2️⃣  Sending 1 HBAR to Operations...');
  try {
    const tx2 = new TransferTransaction()
      .addHbarTransfer(ACCOUNTS.operator, Hbar.from(-TEST_AMOUNT))
      .addHbarTransfer(ACCOUNTS.operations, Hbar.from(TEST_AMOUNT))
      .setTransactionMemo('Test: Operator → Operations');
    
    const response2 = await tx2.execute(client);
    const receipt2 = await response2.getReceipt(client);
    
    results.push({
      test: 'Operator → Operations',
      status: receipt2.status.toString(),
      txId: response2.transactionId?.toString(),
    });
    console.log(`   ✅ Success! Tx: ${response2.transactionId?.toString()}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
    results.push({ test: 'Operator → Operations', status: 'FAILED', error: error.message });
  }
  
  // Test 3: Operator → Reserve
  console.log('3️⃣  Sending 1 HBAR to Reserve...');
  try {
    const tx3 = new TransferTransaction()
      .addHbarTransfer(ACCOUNTS.operator, Hbar.from(-TEST_AMOUNT))
      .addHbarTransfer(ACCOUNTS.reserve, Hbar.from(TEST_AMOUNT))
      .setTransactionMemo('Test: Operator → Reserve');
    
    const response3 = await tx3.execute(client);
    const receipt3 = await response3.getReceipt(client);
    
    results.push({
      test: 'Operator → Reserve',
      status: receipt3.status.toString(),
      txId: response3.transactionId?.toString(),
    });
    console.log(`   ✅ Success! Tx: ${response3.transactionId?.toString()}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
    results.push({ test: 'Operator → Reserve', status: 'FAILED', error: error.message });
  }
  
  // Test 4: Treasury → Operator (return)
  console.log('4️⃣  Treasury returning 1 HBAR to Operator...');
  try {
    const tx4 = new TransferTransaction()
      .addHbarTransfer(ACCOUNTS.treasury, Hbar.from(-TEST_AMOUNT))
      .addHbarTransfer(ACCOUNTS.operator, Hbar.from(TEST_AMOUNT))
      .setTransactionMemo('Test: Treasury → Operator (return)');
    
    const response4 = await tx4.execute(client);
    const receipt4 = await response4.getReceipt(client);
    
    results.push({
      test: 'Treasury → Operator',
      status: receipt4.status.toString(),
      txId: response4.transactionId?.toString(),
    });
    console.log(`   ✅ Success! Tx: ${response4.transactionId?.toString()}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
    results.push({ test: 'Treasury → Operator', status: 'FAILED', error: error.message });
  }
  
  // Test 5: Operations → Operator (return)
  console.log('5️⃣  Operations returning 1 HBAR to Operator...');
  try {
    const tx5 = new TransferTransaction()
      .addHbarTransfer(ACCOUNTS.operations, Hbar.from(-TEST_AMOUNT))
      .addHbarTransfer(ACCOUNTS.operator, Hbar.from(TEST_AMOUNT))
      .setTransactionMemo('Test: Operations → Operator (return)');
    
    const response5 = await tx5.execute(client);
    const receipt5 = await response5.getReceipt(client);
    
    results.push({
      test: 'Operations → Operator',
      status: receipt5.status.toString(),
      txId: response5.transactionId?.toString(),
    });
    console.log(`   ✅ Success! Tx: ${response5.transactionId?.toString()}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
    results.push({ test: 'Operations → Operator', status: 'FAILED', error: error.message });
  }
  
  // Test 6: Reserve → Operator (return)
  console.log('6️⃣  Reserve returning 1 HBAR to Operator...');
  try {
    const tx6 = new TransferTransaction()
      .addHbarTransfer(ACCOUNTS.reserve, Hbar.from(-TEST_AMOUNT))
      .addHbarTransfer(ACCOUNTS.operator, Hbar.from(TEST_AMOUNT))
      .setTransactionMemo('Test: Reserve → Operator (return)');
    
    const response6 = await tx6.execute(client);
    const receipt6 = await response6.getReceipt(client);
    
    results.push({
      test: 'Reserve → Operator',
      status: receipt6.status.toString(),
      txId: response6.transactionId?.toString(),
    });
    console.log(`   ✅ Success! Tx: ${response6.transactionId?.toString()}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
    results.push({ test: 'Reserve → Operator', status: 'FAILED', error: error.message });
  }
  
  // Summary
  console.log('=====================================');
  console.log('📊 TEST SUMMARY\n');
  
  const passed = results.filter(r => r.status === 'SUCCESS').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  
  console.log(`Passed: ${passed}/6`);
  console.log(`Failed: ${failed}/6\n`);
  
  results.forEach(r => {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`${icon} ${r.test}`);
    if (r.txId) {
      console.log(`   Tx: https://hashscan.io/mainnet/transaction/${r.txId}`);
    }
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });
  
  console.log('\n💡 All transactions complete!');
  console.log('Check HashScan for balances:');
  console.log(`  Treasury: https://hashscan.io/mainnet/account/${ACCOUNTS.treasury}`);
  console.log(`  Operations: https://hashscan.io/mainnet/account/${ACCOUNTS.operations}`);
  console.log(`  Reserve: https://hashscan.io/mainnet/account/${ACCOUNTS.reserve}`);
}

testPaymentRoundTrip().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
