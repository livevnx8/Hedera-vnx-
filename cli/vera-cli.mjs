#!/usr/bin/env node
/**
 * Vera CLI - Command Line Interface
 * Manage the Vera Swarm from your terminal
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { VeraSDK } from '../sdk/vera-sdk.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

// Get version from package.json
let version = '6.0.0';
try {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), '../package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  version = pkg.version;
} catch {}

// Initialize SDK
const sdk = new VeraSDK({
  apiKey: process.env.VERA_API_KEY,
  baseURL: process.env.VERA_API_URL || 'http://localhost:4567'
});

// CLI configuration
program
  .name('vera')
  .description('Vera Swarm Command Line Interface')
  .version(version)
  .option('-v, --verbose', 'verbose output')
  .option('--json', 'output as JSON');

// ============================================
// STATUS COMMAND
// ============================================
program
  .command('status')
  .description('Check swarm status')
  .option('-a, --agents <type>', 'filter by agent type')
  .action(async (options) => {
    const spinner = ora('Fetching swarm status...').start();
    
    try {
      if (options.agents) {
        const status = await sdk.getAgentStatus(options.agents);
        spinner.stop();
        
        console.log(chalk.blue(`\n📊 ${options.agents.toUpperCase()} AGENT STATUS\n`));
        console.log(JSON.stringify(status, null, 2));
      } else {
        const status = await sdk.getSwarmStatus();
        spinner.stop();
        
        console.log(chalk.blue('\n🌐 VERA SWARM STATUS\n'));
        console.log(`  Total Agents: ${chalk.green(status.totalAgents)}`);
        console.log(`  Agent Types: ${chalk.green(status.agentTypes)}`);
        console.log(`  Active Chains: ${chalk.green(status.activeChains)}`);
        console.log(`  Falcon Signatures: ${chalk.green(status.falconSignatures)}`);
        console.log(`  Last Update: ${chalk.gray(new Date(status.timestamp).toISOString())}`);
        
        if (status._falcon) {
          console.log(chalk.cyan('\n  🔐 Response signed with Falcon-512'));
        }
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================
// AGENTS COMMAND
// ============================================
program
  .command('agents')
  .description('Manage agents')
  .option('-l, --list', 'list all agents')
  .option('-d, --deploy <type>', 'deploy new agents')
  .option('-c, --count <n>', 'number of agents to deploy', '1')
  .action(async (options) => {
    if (options.list) {
      const spinner = ora('Fetching agents...').start();
      
      try {
        const status = await sdk.getSwarmStatus();
        spinner.stop();
        
        console.log(chalk.blue('\n🤖 AGENT INVENTORY\n'));
        
        const agentTypes = [
          { name: 'Healthcare', icon: '🏥', count: 5 },
          { name: 'Finance', icon: '💰', count: 8 },
          { name: 'Logistics', icon: '🚛', count: 6 },
          { name: 'Government', icon: '🏛️', count: 4 },
          { name: 'Retail', icon: '🏪', count: 7 },
          { name: 'Bridge', icon: '🌉', count: 5 },
          { name: 'Core', icon: '⚡', count: 4 }
        ];
        
        agentTypes.forEach(type => {
          console.log(`  ${type.icon} ${chalk.bold(type.name.padEnd(12))} ${chalk.green(type.count.toString().padStart(2))} agents`);
        });
        
        console.log(chalk.cyan(`\n  Total: ${agentTypes.reduce((a, b) => a + b.count, 0)} agents\n`));
      } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
      }
    }
    
    if (options.deploy) {
      const count = parseInt(options.count);
      console.log(chalk.blue(`\n🚀 Deploying ${count} ${options.deploy} agent(s)...\n`));
      console.log(chalk.yellow('Note: Deployment requires enterprise plan\n'));
    }
  });

// ============================================
// BRIDGE COMMAND
// ============================================
program
  .command('bridge')
  .description('Cross-chain bridge operations')
  .option('-s, --status', 'show bridge status')
  .option('-t, --transfer <amount>', 'initiate transfer')
  .option('--from <chain>', 'source chain')
  .option('--to <chain>', 'target chain')
  .option('--token <token>', 'token to bridge', 'HBAR')
  .option('--recipient <address>', 'recipient address')
  .action(async (options) => {
    if (options.status) {
      const spinner = ora('Fetching bridge status...').start();
      
      try {
        const status = await sdk.getBridgeStatus();
        spinner.stop();
        
        console.log(chalk.blue('\n🌉 BRIDGE STATUS\n'));
        console.log(`  Status: ${chalk.green('Operational')}`);
        console.log(`  Validators: ${chalk.green(status.validators)} online`);
        console.log(`  Bridge Fee: ${chalk.yellow(status.feeBps / 100)}%`);
        console.log(`\n  Supported Chains:`);
        status.supportedChains.forEach(chain => {
          console.log(`    ✓ ${chalk.cyan(chain.charAt(0).toUpperCase() + chain.slice(1))}`);
        });
      } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
      }
    }
    
    if (options.transfer) {
      if (!options.from || !options.to || !options.recipient) {
        console.log(chalk.red('\n❌ Missing required options:'));
        console.log('  --from <chain>    Source chain');
        console.log('  --to <chain>      Target chain');
        console.log('  --recipient <addr> Recipient address\n');
        return;
      }
      
      const spinner = ora('Initiating bridge transfer...').start();
      
      try {
        const result = await sdk.initiateTransfer({
          sourceChain: options.from,
          targetChain: options.to,
          amount: options.transfer,
          token: options.token,
          recipient: options.recipient
        });
        
        spinner.stop();
        
        console.log(chalk.green('\n✅ Transfer Initiated\n'));
        console.log(`  Transfer ID: ${chalk.cyan(result.transferId)}`);
        console.log(`  From: ${chalk.yellow(options.from)}`);
        console.log(`  To: ${chalk.yellow(options.to)}`);
        console.log(`  Amount: ${chalk.green(options.transfer + ' ' + options.token)}`);
        console.log(`  Fee: ${chalk.yellow(result.fee + ' ' + options.token)}`);
        console.log(`  ETA: ${chalk.blue(result.estimatedTime)}\n`);
      } catch (error) {
        spinner.fail(chalk.red(`Transfer failed: ${error.message}`));
      }
    }
  });

// ============================================
// AI COMMAND
// ============================================
program
  .command('ai')
  .description('Vera Starlit AI interface')
  .option('-c, --chat <message>', 'send chat message')
  .option('-i, --interactive', 'interactive chat mode')
  .action(async (options) => {
    if (options.chat) {
      const spinner = ora('Thinking...').start();
      
      try {
        const response = await sdk.chat(options.chat);
        spinner.stop();
        
        console.log(chalk.blue('\n✨ VERA STARLIT\n'));
        console.log(chalk.white(response.response));
        console.log(chalk.gray(`\nIntent: ${response.action} | Response signed: ${response.falconSignature ? '✓' : '✗'}\n`));
      } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
      }
    }
    
    if (options.interactive) {
      console.log(chalk.blue('\n✨ VERA STARLIT - Interactive Mode'));
      console.log(chalk.gray('Type "exit" to quit\n'));
      
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const ask = () => {
        rl.question(chalk.cyan('You: '), async (input) => {
          if (input.toLowerCase() === 'exit') {
            console.log(chalk.gray('\n👋 Goodbye!\n'));
            rl.close();
            return;
          }
          
          const spinner = ora('Thinking...').start();
          
          try {
            const response = await sdk.chat(input);
            spinner.stop();
            console.log(chalk.blue('\nVera: ') + chalk.white(response.response) + '\n');
          } catch (error) {
            spinner.fail(chalk.red(`Error: ${error.message}`));
          }
          
          ask();
        });
      };
      
      ask();
    }
  });

// ============================================
// CONFIG COMMAND
// ============================================
program
  .command('config')
  .description('Manage CLI configuration')
  .option('-s, --show', 'show current config')
  .option('--set-api-key <key>', 'set API key')
  .option('--set-api-url <url>', 'set API URL')
  .action((options) => {
    if (options.show) {
      console.log(chalk.blue('\n⚙️  CURRENT CONFIGURATION\n'));
      console.log(`  API Key: ${process.env.VERA_API_KEY ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
      console.log(`  API URL: ${chalk.cyan(process.env.VERA_API_URL || 'http://localhost:4567')}`);
      console.log(`  Network: ${chalk.cyan(process.env.HEDERA_NETWORK || 'mainnet')}`);
      console.log(chalk.gray('\n  Config file: .env\n'));
    }
    
    if (options.setApiKey) {
      console.log(chalk.yellow('\n⚠️  Set VERA_API_KEY in your .env file\n'));
    }
  });

// Parse arguments
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  console.log(chalk.blue(`
╔═══════════════════════════════════════════════════════════════╗
║  🌐 VERA CLI v${version.padEnd(46)} ║
║  Command Line Interface for Vera Swarm                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Usage: vera <command> [options]                              ║
║                                                               ║
║  Commands:                                                    ║
║    status      Check swarm status                            ║
║    agents      Manage agents                                 ║
║    bridge      Cross-chain bridge operations                ║
║    ai          Vera Starlit AI interface                    ║
║    config      CLI configuration                           ║
║                                                               ║
║  Options:                                                     ║
║    -v, --verbose   Verbose output                           ║
║    --json          Output as JSON                           ║
║    -h, --help      Show help                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `));
}
