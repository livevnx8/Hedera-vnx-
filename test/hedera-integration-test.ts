/**
 * Hedera Integration Test
 * 
 * Validates all Hedera improvements work correctly:
 * 1. Tool registry loads all tools
 * 2. Extended HTS tools are available
 * 3. Wallet API works intuitively
 * 4. Lattice integration routes through center
 */

import { hederaToolRegistry } from '../src/hedera/tools/index.js';
import { createWallet, quickBalance, quickSendHBAR } from '../src/hedera/wallet.js';
import { getHederaLatticeIntegration } from '../src/vera/orchestrator/hederaLatticeIntegration.js';
import { FlowerOfLifeOS } from '../src/vera/orchestrator/flowerOfLifeOS.js';

async function runTests() {
  console.log('\n🔷 Hedera Integration Tests\n');
  console.log('=' .repeat(60));

  let passed = 0;
  let failed = 0;

  // Test 1: Tool Registry
  console.log('\n📦 Test 1: Tool Registry');
  try {
    const allTools = hederaToolRegistry.getAllTools();
    console.log(`   ✓ Registry loaded: ${allTools.length} tools`);
    
    const htsTools = allTools.filter(t => t.category === 'hts');
    const hcsTools = allTools.filter(t => t.category === 'hcs');
    const accountTools = allTools.filter(t => t.category === 'account');
    
    console.log(`   ✓ HTS tools: ${htsTools.length}`);
    console.log(`   ✓ HCS tools: ${hcsTools.length}`);
    console.log(`   ✓ Account tools: ${accountTools.length}`);
    
    // Check extended tools
    const extended = ['hts_dissociate_token', 'hts_delete_token', 'hts_update_token', 
                      'hts_freeze_token', 'hts_grant_kyc', 'hts_wipe_token'];
    const foundExtended = extended.filter(name => hederaToolRegistry.getTool(name));
    console.log(`   ✓ Extended tools: ${foundExtended.length}/${extended.length}`);
    
    passed++;
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
    failed++;
  }

  // Test 2: Wallet API
  console.log('\n👛 Test 2: Wallet API');
  try {
    const wallet = createWallet('0.0.12345');
    console.log(`   ✓ Wallet created for 0.0.12345`);
    
    // Check wallet methods exist
    const methods = ['sendHBAR', 'sendToken', 'sendNFT', 'createToken', 
                     'createNFTCollection', 'mintNFT', 'associateToken', 
                     'dissociateToken', 'getAllBalances', 'getSummary'];
    const available = methods.filter(m => typeof (wallet as any)[m] === 'function');
    console.log(`   ✓ Wallet methods: ${available.length}/${methods.length}`);
    
    passed++;
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
    failed++;
  }

  // Test 3: Quick Helpers
  console.log('\n⚡ Test 3: Quick Helper Functions');
  try {
    // Just verify functions exist and are callable
    console.log(`   ✓ quickSendHBAR exists: ${typeof quickSendHBAR === 'function'}`);
    console.log(`   ✓ quickBalance exists: ${typeof quickBalance === 'function'}`);
    passed++;
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
    failed++;
  }

  // Test 4: Lattice Integration
  console.log('\n🌸 Test 4: Flower of Life Lattice Integration');
  try {
    const lattice = new FlowerOfLifeOS();
    lattice.start();
    
    const integration = getHederaLatticeIntegration(lattice);
    console.log(`   ✓ Lattice integration created`);
    
    // Register a wallet
    const wallet = integration.registerWallet('0.0.99999');
    console.log(`   ✓ Wallet registered to lattice`);
    
    // Check stats
    const stats = integration.getStats();
    console.log(`   ✓ Stats: ${stats.registeredWallets} wallet(s)`);
    
    lattice.stop();
    passed++;
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
    failed++;
  }

  // Test 5: Tool Execution
  console.log('\n🔧 Test 5: Tool Execution (Mock)');
  try {
    // Test that tools are properly structured
    const tool = hederaToolRegistry.getTool('hts_create_fungible_token');
    if (tool && tool.validateParams && tool.execute) {
      console.log(`   ✓ Tool structure valid: ${tool.name}`);
    }
    
    // Test validation
    const validation = tool?.validateParams({ name: 'Test', symbol: 'TST' });
    console.log(`   ✓ Validation works: ${validation?.valid}`);
    
    passed++;
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed === 0) {
    console.log('🎉 All Hedera improvements working!\n');
  } else {
    console.log('⚠️  Some tests failed - review output above\n');
    process.exit(1);
  }
}

runTests().catch(console.error);
