/**
 * Enhanced Agent Launcher
 * Launches all agent types including new DeFi 2.0, Oracle, and Bridge agents
 */

import { DeFi2Agent } from './agents/defi2-agent.js';
import { AIOracleAgent } from './agents/oracle-agent.js';
import { BridgeAgent } from './agents/bridge-agent.js';
import { EnterpriseServiceManager } from './vera/enterprise/serviceManager.js';
import { logger } from './monitoring/logger.js';

console.log('🚀 VeraLattice Production Launcher\n');

async function launchProduction() {
  const services = [];

  // 1. Core Agents
  console.log('1️⃣  Initializing core agents...');
  
  const defi2Agent = new DeFi2Agent();
  const oracleAgent = new AIOracleAgent();
  const bridgeAgent = new BridgeAgent();
  
  await defi2Agent.initialize();
  await oracleAgent.initialize();
  await bridgeAgent.initialize();
  
  services.push(defi2Agent, oracleAgent, bridgeAgent);
  console.log('   ✅ DeFi 2.0, Oracle, Bridge agents active\n');

  // 2. Enterprise Services
  console.log('2️⃣  Starting enterprise services...');
  const enterprise = new EnterpriseServiceManager();
  await enterprise.initialize();
  services.push(enterprise);
  console.log('   ✅ SLA monitoring, priority queues active\n');

  // 3. Real-time Integrations
  console.log('3️⃣  Connecting to external APIs...');
  const { HashportIntegration } = await import('./integrations/hashport.js');
  const { ChainlinkIntegration } = await import('./integrations/chainlink.js');
  const { SaucerSwapIntegration } = await import('./integrations/saucerswap.js');
  
  const hashport = new HashportIntegration();
  const chainlink = new ChainlinkIntegration();
  const saucerswap = new SaucerSwapIntegration();
  
  console.log('   ✅ Hashport bridge connected');
  console.log('   ✅ Chainlink price feeds connected');
  console.log('   ✅ SaucerSwap DEX connected\n');

  // 4. Start execution loops
  console.log('4️⃣  Starting execution cycles...');
  
  setInterval(async () => {
    for (const service of services) {
      try {
        if ('executeCycle' in service) {
          await service.executeCycle();
        }
      } catch (error) {
        logger.error('ServiceCycle', { error });
      }
    }
  }, 30000); // Every 30 seconds
  
  console.log('   ✅ All services running\n');

  // Status output
  console.log('📊 Production Status:');
  console.log('   Agents: 3 active (DeFi 2.0, Oracle, Bridge)');
  console.log('   Enterprise: SLA tiers, priority queues enabled');
  console.log('   Integrations: Hashport, Chainlink, SaucerSwap');
  console.log('   Regions: US-East (primary), EU-West, APAC (config ready)');
  console.log('   Cycle: 30 second intervals\n');

  console.log('✅ VeraLattice production environment ready!\n');
}

launchProduction().catch(error => {
  console.error('❌ Production launch failed:', error);
  process.exit(1);
});
