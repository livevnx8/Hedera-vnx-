/**
 * Example 03: Deploy Agent
 * 
 * Deploy and manage a Vera agent in the sandbox
 * 
 * Run: node examples/sandbox/03-deploy-agent.mjs
 */

const API_URL = process.env.VERA_API_URL || 'http://localhost:8080';

console.log('🧪 Vera Sandbox - Deploy Agent Example\n');

async function deployAgentExample() {
  try {
    // 1. Check agent system
    console.log('1️⃣  Checking agent system...');
    const statusResponse = await fetch(`${API_URL}/api/v1/agents/status`);
    const status = await statusResponse.json();
    
    console.log('   ✅ Agent system status:');
    console.log(`   Active Agents: ${status.activeAgents || 0}`);
    console.log(`   System Health: ${status.healthy ? 'Healthy' : 'Degraded'}\n`);

    // 2. Create a test agent
    console.log('2️⃣  Creating test agent...');
    const agentConfig = {
      id: `test-agent-${Date.now()}`,
      type: 'TEST_MONITOR',
      name: 'Sandbox Test Agent',
      config: {
        interval: 30000, // 30 seconds
        testMode: true,
        logLevel: 'debug'
      },
      metadata: {
        createdBy: 'sandbox-example',
        purpose: 'demonstration',
        ephemeral: true
      }
    };

    const createResponse = await fetch(`${API_URL}/api/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentConfig)
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create agent: ${createResponse.status}`);
    }

    const createdAgent = await createResponse.json();
    console.log('   ✅ Agent created!');
    console.log(`   Agent ID: ${createdAgent.id}`);
    console.log(`   Status: ${createdAgent.status}\n`);

    // 3. Start the agent
    console.log('3️⃣  Starting agent...');
    const startResponse = await fetch(`${API_URL}/api/v1/agents/${createdAgent.id}/start`, {
      method: 'POST'
    });

    if (!startResponse.ok) {
      throw new Error(`Failed to start agent: ${startResponse.status}`);
    }

    console.log('   ✅ Agent started!\n');

    // 4. Monitor agent activity
    console.log('4️⃣  Monitoring agent (5 seconds)...');
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      
      const agentResponse = await fetch(`${API_URL}/api/v1/agents/${createdAgent.id}`);
      const agent = await agentResponse.json();
      
      process.stdout.write(`   ${i + 1}s: Status=${agent.status}, Cycles=${agent.cycles || 0}\r`);
    }
    console.log('\n');

    // 5. Get agent logs
    console.log('5️⃣  Fetching agent logs...');
    const logsResponse = await fetch(`${API_URL}/api/v1/agents/${createdAgent.id}/logs?limit=5`);
    const logs = await logsResponse.json();
    
    console.log(`   ✅ Found ${logs.length} log entries`);
    logs.forEach((log, i) => {
      console.log(`   [${i + 1}] ${new Date(log.timestamp).toISOString()}: ${log.message}`);
    });
    console.log();

    // 6. Stop the agent
    console.log('6️⃣  Stopping agent...');
    const stopResponse = await fetch(`${API_URL}/api/v1/agents/${createdAgent.id}/stop`, {
      method: 'POST'
    });

    if (!stopResponse.ok) {
      throw new Error(`Failed to stop agent: ${stopResponse.status}`);
    }

    console.log('   ✅ Agent stopped\n');

    // 7. List all agents
    console.log('7️⃣  Listing all agents...');
    const listResponse = await fetch(`${API_URL}/api/v1/agents`);
    const agents = await listResponse.json();
    
    console.log(`   ✅ Found ${agents.length} agent(s):`);
    agents.forEach(agent => {
      console.log(`   - ${agent.id} (${agent.type}): ${agent.status}`);
    });
    console.log();

    // 8. Cleanup - delete test agent
    console.log('8️⃣  Cleaning up (deleting test agent)...');
    const deleteResponse = await fetch(`${API_URL}/api/v1/agents/${createdAgent.id}`, {
      method: 'DELETE'
    });

    if (deleteResponse.ok) {
      console.log('   ✅ Test agent deleted\n');
    } else {
      console.log('   ⚠️  Could not delete agent (may require manual cleanup)\n');
    }

    console.log('🎉 Deploy Agent Example Complete!');
    console.log('\nWhat you learned:');
    console.log('  ✅ Creating agents via API');
    console.log('  ✅ Starting and stopping agents');
    console.log('  ✅ Monitoring agent lifecycle');
    console.log('  ✅ Fetching agent logs');
    console.log('  ✅ Cleaning up agents');
    console.log('\nNext steps:');
    console.log('  → Try example 04: node examples/sandbox/04-carbon-audit.mjs');
    console.log('  → Build your own agent with custom logic');
    console.log('  → Read SANDBOX.md for API reference');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('  1. Is the sandbox running? ./vera-sandbox status');
    console.log('  2. Check API URL:', API_URL);
    console.log('  3. View logs: ./vera-sandbox logs');
    console.log('\nNote: If agent API is not available, this is expected in some sandbox configurations');
  }
}

deployAgentExample();
