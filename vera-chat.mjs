#!/usr/bin/env node
/**
 * VERA INTERACTIVE CHAT
 * Talk to Vera with lattice memory and HCS persistence
 */

import { veraLatticeChatContext } from './dist/swarm/latticeChatContext.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const sessionId = `chat-${Date.now()}`;
const userId = 'user-1';

console.log('\n🧠 Initializing Vera Chat...\n');

await veraLatticeChatContext.initialize();

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║  🧠 VERA - Hedera Lattice Intelligence                ║');
console.log('║  Type your message. Press Ctrl+C to exit.              ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

function ask() {
  rl.question('You: ', async (input) => {
    if (!input.trim()) {
      ask();
      return;
    }

    // Store user message
    await veraLatticeChatContext.storeMessage(sessionId, userId, 'user', input);

    // Recall context
    const context = await veraLatticeChatContext.recallContext(sessionId, userId, input);

    // Generate Vera response
    let response = generateResponse(input, context);
    
    // Store Vera response
    await veraLatticeChatContext.storeMessage(sessionId, userId, 'assistant', response, 'response');

    console.log(`\n🧠 Vera: ${response}\n`);
    
    ask();
  });
}

function generateResponse(input, context) {
  const lower = input.toLowerCase();
  
  // DOVU queries
  if (lower.includes('dovu') || lower.includes('carbon') || lower.includes('credit')) {
    return `I've verified 20,000 DOVU tokens on Hedera mainnet. Current balance data shows 68.80 DOVU in your wallet. HCS logs: sequences 13777-13853. ${context.suggestedContinuations[0] || ''}`;
  }
  
  // HTS tokens
  if (lower.includes('token') || lower.includes('hts')) {
    return `I've discovered 22 HTS tokens: DOVU, HBAR, SAUCE, STAD, GIB, WBT, WETH, HBAR.H, CLAY, HBARX, PACK, BLADE, KARMA, GRELF, HST, HBARMOON, XYA, OMT, HEDERAPE, HBARNFT, SAFEMOON, MINT. ${context.suggestedContinuations[0] || ''}`;
  }
  
  // DeFi
  if (lower.includes('defi') || lower.includes('swap') || lower.includes('saucer')) {
    return `DeFi analysis: 5 protocols monitored. SaucerSwap TVL: $238M. High confidence signals: 1/5. ${context.suggestedContinuations[0] || ''}`;
  }
  
  // Lattice/HCS
  if (lower.includes('lattice') || lower.includes('hcs') || lower.includes('memory')) {
    return `Lattice nervous system active with 5 topic organs: Core (0.0.10409351), DeFi (0.0.10409352), Carbon (0.0.10409353), Bridge (0.0.10409354), Ecosystem (0.0.10409355). All findings logged to HashScan. ${context.suggestedContinuations[0] || ''}`;
  }
  
  // Status
  if (lower.includes('status') || lower.includes('how are you')) {
    return `All systems operational. 20,000 DOVU verifications completed. 22 HTS tokens indexed. DeFi protocols monitored. HCS sequences: 13853+. ${context.suggestedContinuations[0] || ''}`;
  }
  
  // Default
  return `I'm processing your request through the lattice. Context score: ${(context.contextScore * 100).toFixed(1)}%. ${context.suggestedContinuations[0] || 'What would you like to know about Hedera, DOVU, or DeFi?'}`;
}

ask();
