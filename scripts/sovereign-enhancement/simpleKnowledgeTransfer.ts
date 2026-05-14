#!/usr/bin/env tsx

/**
 * Simple Vera Knowledge Transfer
 * Extracts and formats Vera's existing data for sovereign fine-tuning
 */

import fs from 'fs/promises';
import path from 'path';

interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
  category: string;
}

class SimpleKnowledgeTransfer {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'training-data');
  }

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Simple Knowledge Transfer...');
    await fs.mkdir(this.outputDir, { recursive: true });
    console.log('✅ Initialized');
  }

  async extractVeraHistory(): Promise<TrainingExample[]> {
    console.log('📖 Extracting Vera conversation history...');
    
    const workRecordsPath = path.join(process.cwd(), 'data/work-records-cache.json');
    const examples: TrainingExample[] = [];
    
    try {
      const data = await fs.readFile(workRecordsPath, 'utf-8');
      const records = JSON.parse(data).records;
      
      for (const record of records) {
        if (record.success && record.outputs?.result && record.outputs.result.length > 50) {
          const example: TrainingExample = {
            instruction: record.description || record.inputs?.task || '',
            input: '',
            output: record.outputs.result,
            category: this.categorizeTask(record.description)
          };
          
          examples.push(example);
        }
      }
      
      console.log(`✅ Extracted ${examples.length} examples`);
      return examples;
    } catch (error) {
      console.error('❌ Error extracting Vera history:', error);
      return [];
    }
  }

  private categorizeTask(description: string): string {
    const desc = description.toLowerCase();
    
    if (desc.includes('defi') || desc.includes('yield') || desc.includes('staking')) {
      return 'defi_analytics';
    }
    if (desc.includes('carbon') || desc.includes('dovu') || desc.includes('verification')) {
      return 'carbon_credits';
    }
    if (desc.includes('security') || desc.includes('audit') || desc.includes('error')) {
      return 'error_handling';
    }
    if (desc.includes('token') || desc.includes('contract') || desc.includes('hedera')) {
      return 'hedera_tools';
    }
    
    return 'general';
  }

  async createBasicExamples(): Promise<TrainingExample[]> {
    console.log('🎭 Creating basic training examples...');
    
    const basicExamples: TrainingExample[] = [
      {
        instruction: 'What can you help me with?',
        input: '',
        output: 'I am Vera, your quantum-enhanced Hedera AI assistant. I can help you with:\n\n🔗 Hedera Blockchain Operations:\n- Create and manage tokens (HTS)\n- Handle smart contracts and transactions\n- Verify carbon credits using DOVU\n- Analyze DeFi protocols and yield strategies\n\n🧠 Advanced Capabilities:\n- Quantum-enhanced reasoning and analysis\n- Real-time blockchain intelligence\n- Multi-agent system coordination\n- Predictive analytics and forecasting\n\n🛠️ Tools Available:\n- 109+ Hedera-specific tools\n- Account management and queries\n- Token operations and analytics\n- File services and consensus\n\nHow can I assist you today?',
        category: 'general'
      },
      {
        instruction: 'Explain Hedera Hashgraph simply',
        input: '',
        output: 'Hedera Hashgraph is a distributed ledger technology that offers an alternative to traditional blockchain. Here\'s what makes it special:\n\n🚀 **Key Features:**\n- **Hashgraph Consensus**: Instead of mining, uses virtual voting for fast, fair consensus\n- **Gossip About Gossip**: Nodes share information efficiently, creating a directed acyclic graph (DAG)\n- **Byzantine Fault Tolerance**: Secure against malicious actors\n- **High Performance**: 10,000+ transactions per second with finality in seconds\n\n⚡ **Advantages over Blockchain:**\n- **Speed**: Much faster transaction confirmation\n- **Cost**: Lower fees (typically fractions of a cent)\n- **Energy**: 100,000x more energy efficient than Proof-of-Work blockchains\n- **Fairness**: Timestamps and transaction order are mathematically guaranteed\n\n🏢 **Governed by:**\n- Hedera Council includes major companies like Google, IBM, and Boeing\n- Decentralized governance with enterprise oversight\n\n💡 **Use Cases:**\n- Micropayments and remittances\n- Token creation and NFTs\n- Supply chain tracking\n- Digital identity\n- Decentralized finance (DeFi)\n\nWould you like me to help you with a specific Hedera operation or explain any aspect in more detail?',
        category: 'hedera_tools'
      },
      {
        instruction: 'How do I create a new Hedera token?',
        input: '',
        output: 'I\'ll help you create a new Hedera token using the Hedera Token Service (HTS). Here\'s the step-by-step process:\n\n📋 **Prerequisites:**\n- Hedera account with HBAR balance\n- Account ID and private key\n- Admin privileges for token management\n\n🔧 **Token Creation Process:**\n\n1. **Define Token Properties:**\n   - Token name and symbol\n   - Initial supply\n   - Decimals (0-18)\n   - Treasury account\n   - Admin and supply keys\n\n2. **Create Token Transaction:**\n   - Build TokenCreate transaction\n   - Set token properties\n   - Sign with treasury key\n   - Submit to network\n\n3. **Token Configuration Options:**\n   - **Fixed supply**: No additional tokens can be created\n   - **Infinite supply**: Can mint new tokens\n   - **Wipeable**: Can delete tokens from accounts\n   - **Freezable**: Can freeze token transfers\n   - **KYC required**: Must pass KYC before holding\n\n📝 **Example Token Creation:**\n```\nToken Name: "MyToken"\nSymbol: "MTK"\nInitial Supply: 1,000,000\nDecimals: 8\nTreasury: 0.0.123456\nAdmin Key: Your public key\nSupply Key: Your public key (if mintable)\n```\n\n⚡ **I can help you create the token right now!** Just provide:\n- Token name and symbol\n- Initial supply amount\n- Your treasury account ID\n\nWould you like me to execute the token creation for you?',
        category: 'hedera_tools'
      },
      {
        instruction: 'Verify this carbon credit',
        input: 'Carbon credit ID: CC-2024-001, Project: Renewable Energy, Amount: 1000 tons CO2',
        output: 'I\'ll verify this carbon credit using the DOVU integration on Hedera blockchain. Let me process this verification:\n\n🔍 **Verification Process:**\n\n1. **Credit Validation:**\n   - Checking carbon credit ID: CC-2024-001\n   - Project type: Renewable Energy\n   - Amount: 1,000 tons CO2\n   - Verifying against DOVU registry\n\n2. **Blockchain Verification:**\n   - Querying DOVU token contract on Hedera\n   - Checking credit ownership and history\n   - Validating project credentials\n   - Confirming carbon offset calculations\n\n3. **Verification Results:**\n   ✅ **Credit ID Valid**: Found in DOVU registry\n   ✅ **Project Verified**: Renewable Energy project certified\n   ✅ **Amount Confirmed**: 1,000 tons CO2 equivalent\n   ✅ **Ownership Clear**: Current holder verified\n   ✅ **No Double Counting**: Credit not previously claimed\n\n📊 **Verification Details:**\n- **Verification ID**: VER-2024-03-29-001\n- **Timestamp**: March 29, 2026\n- **Blockchain**: Hedera Mainnet\n- **Transaction Hash**: [Would be generated during actual verification]\n- **Confidence Score**: 98.5%\n\n💚 **Environmental Impact:**\n- Equivalent to removing 217 cars from roads for one year\n- Same as 50,000 tree seedlings grown for 10 years\n- Powers 150 homes with clean energy for one year\n\n✅ **Verification Complete**: This carbon credit is valid and ready for trading or retirement.\n\nWould you like me to:\n1. Generate a verification certificate?\n2. Check the credit\'s market value?\n3. Process the credit for retirement?',
        category: 'carbon_credits'
      },
      {
        instruction: 'My transaction failed, what should I do?',
        input: '',
        output: 'I\'ll help you troubleshoot your failed Hedera transaction. Let me guide you through the diagnostic process:\n\n🔍 **Step 1: Identify the Error Type**\n\nCommon transaction failure reasons:\n\n❌ **Insufficient Balance:**\n- Check your HBAR balance\n- Include buffer for network fees (typically 0.01-0.05 HBAR)\n- Ensure account is funded\n\n❌ **Invalid Account/Key:**\n- Verify account ID format (0.0.XXXXXX)\n- Check private key matches account\n- Ensure key has proper permissions\n\n❌ **Network Issues:**\n- Check Hedera network status\n- Verify connection to mainnet/testnet\n- Try again after a brief delay\n\n❌ **Sequence Number Issues:**\n- Account may have pending transactions\n- Wait for previous transactions to complete\n- Check account sequence number\n\n❌ **Smart Contract Failures:**\n- Contract reverted during execution\n- Gas limit too low\n- Invalid parameters provided\n\n🛠️ **Diagnostic Steps:**\n\n1. **Get Transaction Details:**\n   - Transaction ID or hash\n   - Error message received\n   - Timestamp of failure\n\n2. **Check Account Status:**\n   - Current HBAR balance\n   - Recent transaction history\n   - Account sequence number\n\n3. **Network Verification:**\n   - Hedera network status\n   - Node availability\n   - Network congestion\n\n💡 **Quick Fixes:**\n\n• **For insufficient balance**: Add more HBAR to your account\n• **For sequence issues**: Wait 60 seconds and retry\n• **For network issues**: Try a different Hedera node\n• **For key issues**: Double-check account credentials\n\n🚀 **I can help you diagnose right now!** Please provide:\n- Transaction ID (if available)\n- Error message you received\n- Account ID used\n\nWould you like me to check your account status or help you retry the transaction?',
        category: 'error_handling'
      },
      {
        instruction: 'What are the best DeFi yield strategies on Hedera?',
        input: '',
        output: 'I\'ll analyze the best DeFi yield strategies available on Hedera, considering both returns and risk factors:\n\n🌟 **Top Hedera DeFi Yield Strategies:**\n\n**1. SaucerSwap Liquidity Providing**\n- **Expected APY**: 15-45% (varies by pair)\n- **Risk Level**: Medium (impermanent loss)\n- **Requirements**: HBAR + paired token\n- **Strategy**: Provide liquidity to HBAR/USDC, HBAR/HTS pairs\n- **Pros**: High yields, Hedera-native DEX\n- **Cons**: Impermanent loss risk\n\n**2. HBAR Staking**\n- **Expected APY**: 6-8% (network staking)\n- **Risk Level**: Low (network security)\n- **Requirements**: Minimum 1 HBAR\n- **Strategy**: Stake HBAR with validators\n- **Pros**: Secure, network-backed returns\n- **Cons**: Lower yields, 30-day unbonding\n\n**3. HTS Token Yield Farming**\n- **Expected APY**: 20-100% (new token launches)\n- **Risk Level**: High (token volatility)\n- **Requirements**: Various HTS tokens\n- **Strategy**: Farm new token launches\n- **Pros**: High potential returns\n- **Cons**: High risk, token failures\n\n**4. Lending Protocols**\n- **Expected APY**: 8-25% (supply side)\n- **Risk Level**: Medium (protocol risk)\n- **Requirements**: HBAR or stablecoins\n- **Strategy**: Supply assets to lending pools\n- **Pros**: Stable returns, collateralized\n- **Cons**: Smart contract risk\n\n📊 **Risk-Adjusted Recommendations:**\n\n**Conservative Portfolio (Target: 8-12% APY):**\n- 70% HBAR staking (6-8% APY)\n- 30% SaucerSwap stablecoin pairs (10-15% APY)\n\n**Balanced Portfolio (Target: 15-25% APY):**\n- 40% HBAR staking (6-8% APY)\n- 40% SaucerSwap HBAR/USDC (15-30% APY)\n- 20% Lending protocols (8-12% APY)\n\n**Aggressive Portfolio (Target: 30-50% APY):**\n- 30% HBAR staking (6-8% APY)\n- 50% SaucerSwap volatile pairs (30-60% APY)\n- 20% New token farms (50-100%+ APY)\n\n⚠️ **Risk Management:**\n\n• **Impermanent Loss**: Monitor pool ratios\n• **Smart Contract Risk**: Use audited protocols only\n• **Token Volatility**: Diversify across multiple assets\n• **Liquidity Risk**: Keep emergency funds available\n\n🔧 **I can help you:**\n1. Analyze specific pools and their historical performance\n2. Set up automated yield farming strategies\n3. Monitor your positions and suggest rebalancing\n4. Calculate expected returns based on your capital\n\nWould you like me to help you set up a specific yield strategy or analyze current market conditions?',
        category: 'defi_analytics'
      }
    ];
    
    console.log(`✅ Created ${basicExamples.length} basic examples`);
    return basicExamples;
  }

  async createDataset(examples: TrainingExample[], filename: string): Promise<void> {
    console.log(`📚 Creating ${filename} dataset...`);
    
    const dataset = {
      examples,
      metadata: {
        total_examples: examples.length,
        categories: this.countCategories(examples),
        generated_at: new Date().toISOString(),
        source: 'vera_sovereign_enhancement'
      }
    };
    
    const filepath = path.join(this.outputDir, filename);
    await fs.writeFile(filepath, JSON.stringify(dataset, null, 2));
    console.log(`💾 Saved ${dataset.examples.length} examples to ${filepath}`);
  }

  private countCategories(examples: TrainingExample[]): Record<string, number> {
    const categories: Record<string, number> = {};
    for (const example of examples) {
      categories[example.category] = (categories[example.category] || 0) + 1;
    }
    return categories;
  }

  async createTrackDatasets(allExamples: TrainingExample[]): Promise<void> {
    console.log('🎯 Creating track-specific datasets...');
    
    // Conversation enhancement dataset
    const conversationExamples = allExamples.filter(
      e => e.category === 'general' || e.category === 'error_handling'
    );
    
    await this.createDataset(conversationExamples, 'conversation-enhancement.jsonl');
    
    // Hedera tools dataset
    const hederaExamples = allExamples.filter(
      e => e.category === 'hedera_tools' || e.category === 'carbon_credits' || e.category === 'defi_analytics'
    );
    
    await this.createDataset(hederaExamples, 'hedera-tools-optimization.jsonl');
    
    console.log('✅ Track-specific datasets created');
  }

  async execute(): Promise<void> {
    console.log('🚀 Starting Simple Knowledge Transfer...\n');
    
    try {
      await this.initialize();
      
      // Extract existing examples
      const existingExamples = await this.extractVeraHistory();
      
      // Add basic examples
      const basicExamples = await this.createBasicExamples();
      
      // Combine all examples
      const allExamples = [...existingExamples, ...basicExamples];
      
      // Create complete dataset
      await this.createDataset(allExamples, 'vera-complete-dataset.jsonl');
      
      // Create track-specific datasets
      await this.createTrackDatasets(allExamples);
      
      console.log('\n🎉 Knowledge Transfer Complete!');
      console.log(`📈 Generated ${allExamples.length} total training examples`);
      console.log('📁 Datasets saved to training-data/ directory');
      console.log('\n📋 Next Steps:');
      console.log('1. Set up fine-tuning environment: npx tsx scripts/sovereign-enhancement/setupFineTuning.ts');
      console.log('2. Run conversation fine-tuning');
      console.log('3. Run Hedera tools fine-tuning');
      console.log('4. Evaluate enhanced models');
      
    } catch (error) {
      console.error('❌ Knowledge transfer failed:', error);
      process.exit(1);
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const transfer = new SimpleKnowledgeTransfer();
  transfer.execute().catch(console.error);
}

export { SimpleKnowledgeTransfer };
