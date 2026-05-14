/**
 * Example 01: Hello Vera
 * 
 * Simple health check and basic API interaction with Vera sandbox
 * 
 * Run: node examples/sandbox/01-hello-vera.mjs
 */

const API_URL = process.env.VERA_API_URL || 'http://localhost:8080';

console.log('🧪 Vera Sandbox - Hello Vera Example\n');
console.log(`Connecting to: ${API_URL}\n`);

async function helloVera() {
  try {
    // 1. Health Check
    console.log('1️⃣  Checking Vera health...');
    const healthResponse = await fetch(`${API_URL}/health`);
    const health = await healthResponse.json();
    
    console.log('   ✅ Vera is healthy!');
    console.log('   Status:', health.status);
    console.log('   Timestamp:', new Date(health.timestamp).toISOString());
    console.log();

    // 2. API Status
    console.log('2️⃣  Getting API status...');
    const statusResponse = await fetch(`${API_URL}/api/v1/status`);
    const status = await statusResponse.json();
    
    console.log('   ✅ API Status received');
    console.log('   Network:', status.network);
    console.log('   Version:', status.version);
    console.log('   Uptime:', status.uptime);
    console.log();

    // 3. List available endpoints
    console.log('3️⃣  Exploring API...');
    const endpoints = [
      '/health',
      '/api/v1/status',
      '/api/v1/agents',
      '/api/v1/topics',
      '/api/v1/carbon/projects',
      '/api/v1/energy/grid'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${API_URL}${endpoint}`);
        const symbol = response.ok ? '✅' : '⚠️';
        console.log(`   ${symbol} ${endpoint} (${response.status})`);
      } catch (e) {
        console.log(`   ❌ ${endpoint} (unavailable)`);
      }
    }
    console.log();

    console.log('🎉 Hello Vera complete!');
    console.log('\nNext steps:');
    console.log('  → Try example 02: node examples/sandbox/02-create-topic.mjs');
    console.log('  → Try example 03: node examples/sandbox/03-deploy-agent.mjs');
    console.log('  → Read SANDBOX.md for full documentation');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('  1. Is the sandbox running? ./vera-sandbox status');
    console.log('  2. Check the API URL:', API_URL);
    console.log('  3. View logs: ./vera-sandbox logs');
  }
}

helloVera();
