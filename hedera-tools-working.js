/**
 * Working Hedera Tools Demo (JavaScript)
 * Fully functional demo of all Hedera tools
 */

const { 
  Client, 
  TokenCreateTransaction, 
  TokenType, 
  TokenMintTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  AccountBalanceQuery,
  TransferTransaction,
  Hbar,
  PrivateKey,
  AccountId
} = require('@hashgraph/sdk');

// Initialize client from environment
function getClient() {
  const network = process.env.HEDERA_NETWORK || 'mainnet';
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  
  if (process.env.HEDERA_OPERATOR_ACCOUNT_ID && process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
    const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
    let privateKey;
    
    try {
      if (keyStr.length === 64) {
        try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
        catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
      } else {
        privateKey = PrivateKey.fromString(keyStr);
      }
      
      client.setOperator(process.env.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
      console.log('✅ Hedera client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize client:', error.message);
      throw error;
    }
  }
  
  return client;
}

// ============================================================================
// HTS TOOLS
// ============================================================================

async function createFungibleToken(params) {
  const client = getClient();
  
  try {
    const transaction = new TokenCreateTransaction()
      .setTokenName(params.name)
      .setTokenSymbol(params.symbol)
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(params.decimals || 8)
      .setInitialSupply(params.initialSupply || 0);

    if (params.maxSupply) {
      transaction.setMaxSupply(params.maxSupply);
    }

    if (params.treasuryId) {
      transaction.setTreasuryAccountId(AccountId.fromString(params.treasuryId));
    }

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const tokenId = receipt.tokenId.toString();

    return {
      success: true,
      data: {
        tokenId,
        name: params.name,
        symbol: params.symbol,
        type: 'Fungible',
        decimals: params.decimals || 8,
        initialSupply: params.initialSupply || 0
      },
      transactionId: txResponse.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/mainnet/token/${tokenId}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function createNFTCollection(params) {
  const client = getClient();
  
  try {
    const transaction = new TokenCreateTransaction()
      .setTokenName(params.name)
      .setTokenSymbol(params.symbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0);

    if (params.maxSupply) {
      transaction.setMaxSupply(params.maxSupply);
    }

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const tokenId = receipt.tokenId.toString();

    return {
      success: true,
      data: {
        tokenId,
        name: params.name,
        symbol: params.symbol,
        type: 'NFT Collection',
        maxSupply: params.maxSupply || 'Unlimited'
      },
      transactionId: txResponse.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/mainnet/token/${tokenId}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function mintFungibleToken(params) {
  const client = getClient();
  
  try {
    const transaction = new TokenMintTransaction()
      .setTokenId(params.tokenId)
      .setAmount(params.amount);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return {
      success: true,
      data: {
        tokenId: params.tokenId,
        mintedAmount: params.amount
      },
      transactionId: txResponse.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/mainnet/token/${params.tokenId}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// HCS TOOLS
// ============================================================================

async function createTopic(params) {
  const client = getClient();
  
  try {
    const transaction = new TopicCreateTransaction();
    
    if (params.memo) {
      transaction.setTopicMemo(params.memo);
    }

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const topicId = receipt.topicId.toString();

    return {
      success: true,
      data: {
        topicId,
        memo: params.memo || null
      },
      transactionId: txResponse.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/mainnet/topic/${topicId}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function sendMessage(params) {
  const client = getClient();
  
  try {
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(params.topicId)
      .setMessage(params.message);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return {
      success: true,
      data: {
        topicId: params.topicId,
        message: params.message,
        messageLength: params.message.length
      },
      transactionId: txResponse.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/mainnet/topic/${params.topicId}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// ACCOUNT TOOLS
// ============================================================================

async function getAccountBalance(params) {
  const client = getClient();
  
  try {
    const query = new AccountBalanceQuery()
      .setAccountId(params.accountId);
    
    const accountBalance = await query.execute(client);

    return {
      success: true,
      data: {
        accountId: params.accountId,
        hbarBalance: accountBalance.hbars.toString(),
        hbarBalanceTinybar: accountBalance.hbars.toTinybars().toString()
      },
      hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function transferHBAR(params) {
  const client = getClient();
  
  try {
    const senderId = params.fromAccountId 
      ? AccountId.fromString(params.fromAccountId)
      : client.operatorAccountId;
    
    const recipientId = AccountId.fromString(params.toAccountId);
    const amount = Hbar.fromTinybars(Math.floor(params.amount * 100_000_000));

    const transaction = new TransferTransaction()
      .addHbarTransfer(senderId, amount.negated())
      .addHbarTransfer(recipientId, amount);
    
    if (params.memo) {
      transaction.setTransactionMemo(params.memo);
    }

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return {
      success: true,
      data: {
        from: senderId.toString(),
        to: recipientId.toString(),
        amount: params.amount,
        memo: params.memo || null
      },
      transactionId: txResponse.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/mainnet/transaction/${txResponse.transactionId.toString().replace('@', '-')}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// DEMO
// ============================================================================

async function runDemo() {
  console.log('🚀 Hedera Tools Working Demo\n');
  console.log('=============================\n');

  // Check environment
  if (!process.env.HEDERA_OPERATOR_ACCOUNT_ID || !process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
    console.log('⚠️  Environment not configured. Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY');
    console.log('   Showing tool examples instead...\n');
    
    showExamples();
    return;
  }

  console.log('✅ Environment configured');
  console.log(`   Account: ${process.env.HEDERA_OPERATOR_ACCOUNT_ID}`);
  console.log(`   Network: ${process.env.HEDERA_NETWORK || 'mainnet'}\n`);

  // Test 1: Get Account Balance
  console.log('1️⃣  Testing: Get Account Balance');
  const balanceResult = await getAccountBalance({
    accountId: process.env.HEDERA_OPERATOR_ACCOUNT_ID
  });
  console.log(balanceResult.success ? '   ✅ Success' : `   ❌ Error: ${balanceResult.error}`);
  if (balanceResult.success) {
    console.log(`   Balance: ${balanceResult.data.hbarBalance} HBAR`);
  }
  console.log('');

  // Test 2: Create Topic
  console.log('2️⃣  Testing: Create HCS Topic');
  const topicResult = await createTopic({
    memo: 'Vera Tools Demo Topic'
  });
  console.log(topicResult.success ? '   ✅ Success' : `   ❌ Error: ${topicResult.error}`);
  if (topicResult.success) {
    console.log(`   Topic ID: ${topicResult.data.topicId}`);
    console.log(`   HashScan: ${topicResult.hashscanUrl}`);
  }
  console.log('');

  // Test 3: Send Message (if topic created)
  if (topicResult.success) {
    console.log('3️⃣  Testing: Send HCS Message');
    const messageResult = await sendMessage({
      topicId: topicResult.data.topicId,
      message: 'Hello from Vera Hedera Tools!'
    });
    console.log(messageResult.success ? '   ✅ Success' : `   ❌ Error: ${messageResult.error}`);
    if (messageResult.success) {
      console.log(`   Message sent to topic ${messageResult.data.topicId}`);
    }
    console.log('');
  }

  console.log('=============================\n');
  console.log('✅ Demo Complete!\n');
}

function showExamples() {
  console.log('📋 Tool Usage Examples:\n');
  
  console.log('Create Fungible Token:');
  console.log('  createFungibleToken({');
  console.log('    name: "MyToken",');
  console.log('    symbol: "MTK",');
  console.log('    decimals: 8,');
  console.log('    initialSupply: 1000000');
  console.log('  });\n');
  
  console.log('Create NFT Collection:');
  console.log('  createNFTCollection({');
  console.log('    name: "MyArt",');
  console.log('    symbol: "ART",');
  console.log('    maxSupply: 1000');
  console.log('  });\n');
  
  console.log('Get Account Balance:');
  console.log('  getAccountBalance({');
  console.log('    accountId: "0.0.12345"');
  console.log('  });\n');
  
  console.log('Transfer HBAR:');
  console.log('  transferHBAR({');
  console.log('    toAccountId: "0.0.67890",');
  console.log('    amount: 10');
  console.log('  });\n');
  
  console.log('Create HCS Topic:');
  console.log('  createTopic({');
  console.log('    memo: "My messaging topic"');
  console.log('  });\n');
  
  console.log('Send HCS Message:');
  console.log('  sendMessage({');
  console.log('    topicId: "0.0.12345",');
  console.log('    message: "Hello Hedera!"');
  console.log('  });\n');
}

// Run if executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = {
  createFungibleToken,
  createNFTCollection,
  mintFungibleToken,
  createTopic,
  sendMessage,
  getAccountBalance,
  transferHBAR,
  getClient
};
