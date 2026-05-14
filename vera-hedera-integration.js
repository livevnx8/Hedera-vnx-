/**
 * Vera Hedera Tools Integration
 * Connects Hedera tools to Vera's chat interface
 */

// Import Hedera tools
const hederaTools = require('./hedera-tools-working.js');

class VeraHederaIntegration {
  constructor() {
    this.tools = {
      // HTS Tools
      'create_token': hederaTools.createFungibleToken,
      'create_nft_collection': hederaTools.createNFTCollection,
      'mint_token': hederaTools.mintFungibleToken,
      
      // HCS Tools
      'create_topic': hederaTools.createTopic,
      'send_message': hederaTools.sendMessage,
      
      // Account Tools
      'get_balance': hederaTools.getAccountBalance,
      'transfer_hbar': hederaTools.transferHBAR
    };
  }

  /**
   * Process natural language command and execute appropriate tool
   */
  async processCommand(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Parse intent and extract parameters
    if (message.includes('create') && message.includes('token')) {
      return this.handleCreateToken(message);
    }
    
    if (message.includes('create') && message.includes('nft')) {
      return this.handleCreateNFT(message);
    }
    
    if (message.includes('balance') || message.includes('check account')) {
      return this.handleGetBalance(message);
    }
    
    if (message.includes('transfer') || message.includes('send') && message.includes('hbar')) {
      return this.handleTransferHBAR(message);
    }
    
    if (message.includes('create') && message.includes('topic')) {
      return this.handleCreateTopic(message);
    }
    
    if (message.includes('send') && message.includes('message')) {
      return this.handleSendMessage(message);
    }
    
    return {
      success: false,
      message: "I don't recognize that Hedera command. Try asking me to:\n" +
               "• Create a token\n" +
               "• Create an NFT collection\n" +
               "• Check account balance\n" +
               "• Transfer HBAR\n" +
               "• Create an HCS topic\n" +
               "• Send an HCS message"
    };
  }

  async handleCreateToken(message) {
    // Extract parameters from message
    const nameMatch = message.match(/name["']?\s*[:=]?\s*["']?([^,"'\s]+)/i);
    const symbolMatch = message.match(/symbol["']?\s*[:=]?\s*["']?([^,"'\s]+)/i);
    const supplyMatch = message.match(/(?:supply|amount)["']?\s*[:=]?\s*(\d+)/i);
    
    const params = {
      name: nameMatch ? nameMatch[1] : 'MyToken',
      symbol: symbolMatch ? symbolMatch[1] : 'MTK',
      decimals: 8,
      initialSupply: supplyMatch ? parseInt(supplyMatch[1]) : 1000000
    };
    
    console.log('🪙 Creating token with params:', params);
    
    const result = await hederaTools.createFungibleToken(params);
    
    if (result.success) {
      return {
        success: true,
        message: `✅ Token created successfully!\n\n` +
                 `**Token ID:** ${result.data.tokenId}\n` +
                 `**Name:** ${result.data.name}\n` +
                 `**Symbol:** ${result.data.symbol}\n` +
                 `**Decimals:** ${result.data.decimals}\n` +
                 `**Initial Supply:** ${result.data.initialSupply.toLocaleString()}\n\n` +
                 `**View on HashScan:** ${result.hashscanUrl}`
      };
    } else {
      return {
        success: false,
        message: `❌ Failed to create token: ${result.error}`
      };
    }
  }

  async handleCreateNFT(message) {
    const nameMatch = message.match(/name["']?\s*[:=]?\s*["']?([^,"'\s]+)/i);
    const symbolMatch = message.match(/symbol["']?\s*[:=]?\s*["']?([^,"'\s]+)/i);
    const maxSupplyMatch = message.match(/max[_\s]?supply["']?\s*[:=]?\s*(\d+)/i);
    
    const params = {
      name: nameMatch ? nameMatch[1] : 'MyNFTCollection',
      symbol: symbolMatch ? symbolMatch[1] : 'MNC',
      maxSupply: maxSupplyMatch ? parseInt(maxSupplyMatch[1]) : undefined
    };
    
    console.log('🎨 Creating NFT collection with params:', params);
    
    const result = await hederaTools.createNFTCollection(params);
    
    if (result.success) {
      return {
        success: true,
        message: `✅ NFT Collection created!\n\n` +
                 `**Collection ID:** ${result.data.tokenId}\n` +
                 `**Name:** ${result.data.name}\n` +
                 `**Symbol:** ${result.data.symbol}\n` +
                 `**Max Supply:** ${result.data.maxSupply}\n\n` +
                 `**View on HashScan:** ${result.hashscanUrl}\n\n` +
                 `Now you can mint NFTs to this collection!`
      };
    } else {
      return {
        success: false,
        message: `❌ Failed to create NFT collection: ${result.error}`
      };
    }
  }

  async handleGetBalance(message) {
    const accountMatch = message.match(/(?:account|id)["']?\s*[:=]?\s*["']?(0\.0\.\d+)/i);
    
    const params = {
      accountId: accountMatch ? accountMatch[1] : process.env.HEDERA_OPERATOR_ACCOUNT_ID
    };
    
    console.log('💰 Checking balance for:', params.accountId);
    
    const result = await hederaTools.getAccountBalance(params);
    
    if (result.success) {
      return {
        success: true,
        message: `💰 **Account Balance**\n\n` +
                 `**Account:** ${result.data.accountId}\n` +
                 `**HBAR:** ${result.data.hbarBalance}\n` +
                 `**Tinybars:** ${result.data.hbarBalanceTinybar}\n\n` +
                 `**View on HashScan:** ${result.hashscanUrl}`
      };
    } else {
      return {
        success: false,
        message: `❌ Failed to get balance: ${result.error}`
      };
    }
  }

  async handleTransferHBAR(message) {
    const toMatch = message.match(/(?:to|recipient)["']?\s*[:=]?\s*["']?(0\.0\.\d+)/i);
    const amountMatch = message.match(/(?:amount|send|transfer)["']?\s*[:=]?\s*(\d+\.?\d*)/i);
    
    if (!toMatch) {
      return {
        success: false,
        message: '❌ Please specify a recipient account (e.g., "transfer 10 HBAR to 0.0.12345")'
      };
    }
    
    if (!amountMatch) {
      return {
        success: false,
        message: '❌ Please specify an amount (e.g., "transfer 10 HBAR to 0.0.12345")'
      };
    }
    
    const params = {
      toAccountId: toMatch[1],
      amount: parseFloat(amountMatch[1]),
      memo: 'Vera transfer'
    };
    
    console.log('💸 Transferring HBAR:', params);
    
    const result = await hederaTools.transferHBAR(params);
    
    if (result.success) {
      return {
        success: true,
        message: `💸 **Transfer Successful!**\n\n` +
                 `**From:** ${result.data.from}\n` +
                 `**To:** ${result.data.to}\n` +
                 `**Amount:** ${result.data.amount} HBAR\n` +
                 `**Memo:** ${result.data.memo}\n\n` +
                 `**Transaction ID:** ${result.transactionId}\n` +
                 `**View on HashScan:** ${result.hashscanUrl}`
      };
    } else {
      return {
        success: false,
        message: `❌ Transfer failed: ${result.error}`
      };
    }
  }

  async handleCreateTopic(message) {
    const memoMatch = message.match(/memo["']?\s*[:=]?\s*["']?([^"']+)["']?/i);
    
    const params = {
      memo: memoMatch ? memoMatch[1] : 'Vera messaging topic'
    };
    
    console.log('📢 Creating topic with memo:', params.memo);
    
    const result = await hederaTools.createTopic(params);
    
    if (result.success) {
      return {
        success: true,
        message: `📢 **Topic Created!**\n\n` +
                 `**Topic ID:** ${result.data.topicId}\n` +
                 `**Memo:** ${result.data.memo}\n\n` +
                 `**View on HashScan:** ${result.hashscanUrl}\n\n` +
                 `You can now send messages to this topic!`
      };
    } else {
      return {
        success: false,
        message: `❌ Failed to create topic: ${result.error}`
      };
    }
  }

  async handleSendMessage(message) {
    const topicMatch = message.match(/(?:topic|to)["']?\s*[:=]?\s*["']?(0\.0\.\d+)/i);
    const msgMatch = message.match(/(?:message|say|text)["']?\s*[:=]?\s*["']?([^"']+)["']?/i);
    
    if (!topicMatch) {
      return {
        success: false,
        message: '❌ Please specify a topic ID (e.g., "send message to 0.0.12345: Hello")'
      };
    }
    
    const params = {
      topicId: topicMatch[1],
      message: msgMatch ? msgMatch[1] : 'Hello from Vera!'
    };
    
    console.log('📨 Sending message:', params);
    
    const result = await hederaTools.sendMessage(params);
    
    if (result.success) {
      return {
        success: true,
        message: `📨 **Message Sent!**\n\n` +
                 `**Topic:** ${result.data.topicId}\n` +
                 `**Message:** "${result.data.message}"\n` +
                 `**Length:** ${result.data.messageLength} characters\n\n` +
                 `**Transaction ID:** ${result.transactionId}\n` +
                 `**View on HashScan:** ${result.hashscanUrl}`
      };
    } else {
      return {
        success: false,
        message: `❌ Failed to send message: ${result.error}`
      };
    }
  }
}

// Export for use in chat interface
module.exports = { VeraHederaIntegration };

// Demo if run directly
if (require.main === module) {
  const integration = new VeraHederaIntegration();
  
  console.log('🚀 Vera Hedera Tools Integration Demo\n');
  console.log('========================================\n');
  
  // Test command parsing
  const testCommands = [
    'Create a token named VeraToken with symbol VERA and supply 1000000',
    'Create an NFT collection called VeraArt with symbol VART',
    'Check balance for account 0.0.10294360',
    'Transfer 5 HBAR to 0.0.12345',
    'Create a topic with memo "Vera Messages"',
    'Send message to 0.0.10409351: Hello Hedera!'
  ];
  
  async function runTests() {
    for (const command of testCommands) {
      console.log(`\n📝 Command: "${command}"`);
      console.log('---');
      
      const result = await integration.processCommand(command);
      console.log(result.message);
      console.log('---\n');
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  runTests().catch(console.error);
}
