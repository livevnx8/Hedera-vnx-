#!/usr/bin/env node
/**
 * Vera Bridge Deployment & CLI Tool
 * Deploy and manage cross-chain bridge components
 */

import { BridgeOrchestrator, BRIDGE_CONFIG } from '../agents/vera-evm-bridge.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BridgeCLI {
  constructor() {
    this.orchestrator = null;
    this.commands = {
      'deploy': this.deployBridge.bind(this),
      'status': this.showStatus.bind(this),
      'transfer': this.initiateTransfer.bind(this),
      'validators': this.manageValidators.bind(this),
      'fees': this.manageFees.bind(this),
      'help': this.showHelp.bind(this)
    };
  }

  async deployBridge(args) {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🌉 VERA EVM BRIDGE DEPLOYMENT                                ║
║  Phase 3: Cross-Chain Integration                             ║
╠═══════════════════════════════════════════════════════════════╣
║  Chains: Hedera ↔ Ethereum ↔ Polygon ↔ Arbitrum               ║
║  Security: Falcon-512 + 3-of-5 Multi-Sig                      ║
║  Pattern: HTLC Atomic Swaps                                   ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    this.orchestrator = new BridgeOrchestrator();
    
    try {
      await this.orchestrator.initialize();
      await this.orchestrator.run();
      
      console.log('\n✅ Bridge deployed successfully!\n');
      console.log('Components:');
      console.log('  • 3 Bridge Validators (Falcon-512 attestation)');
      console.log('  • HTLC Escrow Manager (24h lock duration)');
      console.log('  • EVM Relayer (Ethereum, Polygon, Arbitrum)');
      console.log('  • Bridge Orchestrator (coordination)');
      console.log('\nBridge Fee: 0.25% per transfer');
      console.log('Min Signatures: 3 validators required');
      
      return this.orchestrator;
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  async showStatus() {
    if (!this.orchestrator) {
      console.log('⚠️ Bridge not deployed. Run: deploy-bridge deploy');
      return;
    }

    const stats = this.orchestrator.getBridgeStats();
    
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🌉 VERA BRIDGE STATUS                                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Total Transfers: ${stats.total.toString().padEnd(38)} ┃
┃  Completed: ${stats.completed.toString().padEnd(43)} ┃
┃  Failed: ${stats.failed.toString().padEnd(46)} ┃
┃  Total Volume: ${stats.volume.toString().padEnd(41)} ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Active Transfers: ${stats.activeTransfers.toString().padEnd(35)} ┃
┃  Validators Online: ${stats.validators.toString().padEnd(34)} ┃
┃  Bridge Fee: ${stats.feeBps / 100}%${''.padEnd(47)} ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Supported Chains:                                          ┃
${stats.supportedChains.map(c => `┃    • ${c.padEnd(54)} ┃`).join('\n')}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  async initiateTransfer(args) {
    if (!this.orchestrator) {
      console.log('⚠️ Bridge not deployed. Run: deploy-bridge deploy');
      return;
    }

    // Parse args or use interactive prompts
    const transfer = {
      sourceChain: args[0] || 'hedera',
      targetChain: args[1] || 'ethereum',
      sender: args[2] || process.env.HEDERA_OPERATOR_ID,
      recipient: args[3] || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      amount: args[4] || '1000',
      token: args[5] || 'HBAR'
    };

    console.log('\n🌉 Initiating Transfer:');
    console.log(`  From: ${transfer.sender} (${transfer.sourceChain})`);
    console.log(`  To: ${transfer.recipient} (${transfer.targetChain})`);
    console.log(`  Amount: ${transfer.amount} ${transfer.token}`);

    try {
      const result = await this.orchestrator.initiateTransfer(transfer);
      console.log('\n✅ Transfer initiated!');
      console.log(`   Transfer ID: ${result.transferId}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Escrow Hash: ${result.escrowHash}`);
    } catch (error) {
      console.error('❌ Transfer failed:', error.message);
    }
  }

  async manageValidators(args) {
    if (!this.orchestrator) {
      console.log('⚠️ Bridge not deployed.');
      return;
    }

    const action = args[0] || 'list';
    
    if (action === 'list') {
      console.log('\n🔐 Active Validators:');
      this.orchestrator.validators.forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.id} (${v.type})`);
      });
    }
  }

  async manageFees(args) {
    const stats = this.orchestrator?.getBridgeStats();
    if (!stats) {
      console.log('⚠️ Bridge not deployed.');
      return;
    }

    console.log(`
💰 Bridge Fee Structure:
  Current Fee: ${stats.feeBps / 100}%
  
  Example Fees:
  • 100 HBAR = 0.25 HBAR fee
  • 1,000 HBAR = 2.5 HBAR fee
  • 10,000 HBAR = 25 HBAR fee
  
  Min Signatures: 3 validators
  Validator Reward: 50% of fees distributed
    `);
  }

  showHelp() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🌉 VERA BRIDGE CLI - COMMANDS                                ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  deploy              Deploy bridge components                 ║
║  status              Show bridge statistics                   ║
║  transfer            Initiate cross-chain transfer           ║
║  validators          Manage bridge validators                ║
║  fees                Show fee structure                     ║
║  help                Show this help                          ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  Example Usage:                                               ║
║                                                               ║
║  deploy-bridge deploy                                        ║
║  deploy-bridge transfer hedera ethereum 0.0.123 0xabc 1000   ║
║  deploy-bridge status                                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  async run(args) {
    const command = args[0] || 'help';
    const commandArgs = args.slice(1);
    
    const handler = this.commands[command];
    if (handler) {
      await handler(commandArgs);
    } else {
      console.log(`Unknown command: ${command}`);
      this.showHelp();
    }
  }
}

// Run CLI
const cli = new BridgeCLI();
cli.run(process.argv.slice(2)).catch(console.error);

export { BridgeCLI };
