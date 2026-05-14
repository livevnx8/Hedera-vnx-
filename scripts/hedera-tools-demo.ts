#!/usr/bin/env tsx

/**
 * Comprehensive Hedera Tools Demo
 * Demonstrates all HTS, HCS, Account, and Query tools
 */

import { hederaToolRegistry } from '../src/hedera/tools/index.js';
import { htsTools } from '../src/hedera/tools/hts/index.js';
import { hcsTools } from '../src/hedera/tools/hcs/index.js';
import { accountTools } from '../src/hedera/tools/account/index.js';
import { queryTools } from '../src/hedera/tools/queries/index.js';

console.log('🚀 Hedera Tools Comprehensive Demo\n');
console.log('=====================================\n');

// Register all tools
console.log('📋 Registering Hedera Tools...\n');

[...htsTools, ...hcsTools, ...accountTools, ...queryTools].forEach(tool => {
  hederaToolRegistry.register(tool);
  console.log(`  ✅ ${tool.name} (${tool.category})`);
});

console.log('\n=====================================\n');

// Display available tools by category
console.log('🔧 Available Hedera Tools:\n');

const categories = hederaToolRegistry.getCategories();
categories.forEach(category => {
  const tools = hederaToolRegistry.getToolsByCategory(category);
  console.log(`\n${category.toUpperCase()} (${tools.length} tools):`);
  tools.forEach(tool => {
    console.log(`  • ${tool.name}`);
    console.log(`    ${tool.description}`);
  });
});

console.log('\n=====================================\n');

// Demo usage examples
console.log('💡 Tool Usage Examples:\n');

const examples = [
  {
    tool: 'hts_create_fungible_token',
    description: 'Create a new fungible token',
    params: {
      name: 'MyDemoToken',
      symbol: 'MDT',
      decimals: 8,
      initialSupply: 1000000
    }
  },
  {
    tool: 'hts_create_nft_collection',
    description: 'Create an NFT collection',
    params: {
      name: 'MyArtCollection',
      symbol: 'MAC',
      maxSupply: 1000
    }
  },
  {
    tool: 'hcs_create_topic',
    description: 'Create an HCS topic',
    params: {
      memo: 'Demo messaging topic'
    }
  },
  {
    tool: 'account_get_balance',
    description: 'Query account balance',
    params: {
      accountId: '0.0.10294360'
    }
  },
  {
    tool: 'query_get_token_info',
    description: 'Get token information',
    params: {
      tokenId: '0.0.1234567'
    }
  }
];

examples.forEach((example, index) => {
  console.log(`${index + 1}. ${example.tool}`);
  console.log(`   ${example.description}`);
  console.log(`   Parameters: ${JSON.stringify(example.params, null, 2)}`);
  console.log('');
});

console.log('=====================================\n');

// Tool execution workflow
console.log('⚡ Tool Execution Workflow:\n');

console.log('Step 1: Validate Parameters');
console.log('  const validation = tool.validateParams(params);');
console.log('  if (!validation.valid) { throw new Error(validation.error); }\n');

console.log('Step 2: Execute Tool');
console.log('  const result = await hederaToolRegistry.executeTool(toolName, params);\n');

console.log('Step 3: Handle Result');
console.log('  if (result.success) {');
console.log('    console.log("Success:", result.data);');
console.log('    console.log("Transaction:", result.transactionId);');
console.log('    console.log("HashScan:", result.hashscanUrl);');
console.log('  } else {');
console.log('    console.error("Error:", result.error);');
console.log('  }\n');

console.log('=====================================\n');

// Integration example
console.log('🔗 Integration with Vera:\n');

console.log(`
// In your chat interface or agent:
import { hederaToolRegistry } from './hedera/tools/index.js';

// When user asks to create a token:
const result = await hederaToolRegistry.executeTool(
  'hts_create_fungible_token',
  {
    name: userTokenName,
    symbol: userTokenSymbol,
    decimals: 8,
    initialSupply: userSupply
  }
);

// Return formatted response to user:
if (result.success) {
  return \`Token created successfully!
  • Token ID: \${result.data.tokenId}
  • Name: \${result.data.name}
  • Symbol: \${result.data.symbol}
  • View on HashScan: \${result.hashscanUrl}\`;
} else {
  return \`Failed to create token: \${result.error}\`;
}
`);

console.log('\n=====================================\n');

// Summary
console.log('📊 Summary:\n');
console.log(`Total Tools Registered: ${hederaToolRegistry.getAllTools().length}`);
console.log(`Categories: ${categories.join(', ')}`);
console.log(`\nTool Registry is ready for production use!\n`);

console.log('=====================================\n');
console.log('✅ Hedera Tools Demo Complete!\n');
