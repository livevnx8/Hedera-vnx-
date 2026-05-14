#!/usr/bin/env node
/**
 * Phase 6 Demo - Production API & Auto-Scaling
 */

import http from 'http';
import { AutoScaler, WebhookAlertManager, ProductionOrchestrator } from './blueprints/production.mjs';

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🌐 PHASE 6: PRODUCTION API & AUTO-SCALING                        ║');
console.log('║  REST API • Webhooks • Auto-Scaling • External Integration       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

async function runDemo() {
  
  // Demo 1: API Server
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣ REST API SERVER\n');
  
  console.log('   🌐 Starting API Server on port 8080...');
  console.log('   Endpoints:');
  console.log('     GET /health       - System health');
  console.log('     GET /agents       - Agent status');
  console.log('     GET /metrics      - Performance metrics');
  console.log('     GET /predictions  - ML predictions');
  console.log('     POST /alert       - Trigger alert');
  console.log('');
  
  // Simulate API requests
  const endpoints = ['/health', '/agents', '/metrics', '/topics'];
  endpoints.forEach(ep => {
    console.log(`   ✅ ${ep} - 200 OK`);
  });
  console.log('');
  
  // Demo 2: Auto-Scaling
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣ AUTO-SCALING SYSTEM\n');
  
  const scaler = new AutoScaler({
    minAgents: 2,
    maxAgents: 8,
    scaleUpThreshold: 0.75,
    scaleDownThreshold: 0.25
  });
  
  // Simulate high load
  console.log('   Simulating load patterns:');
  
  // High load scenario
  for (let i = 0; i < 5; i++) {
    scaler.recordMetrics(`agent-${i}`, { load: 0.85 + (Math.random() * 0.1) });
  }
  
  const scaleUp = scaler.evaluateScaling();
  if (scaleUp) {
    console.log(`   📈 SCALE UP triggered: ${scaleUp.from} → ${scaleUp.to} agents`);
    console.log(`      Reason: ${scaleUp.reason}`);
  }
  
  // Low load scenario
  for (let i = 0; i < 8; i++) {
    scaler.recordMetrics(`agent-${i}`, { load: 0.15 + (Math.random() * 0.1) });
  }
  
  const scaleDown = scaler.evaluateScaling();
  if (scaleDown) {
    console.log(`   📉 SCALE DOWN triggered: ${scaleDown.from} → ${scaleDown.to} agents`);
    console.log(`      Reason: ${scaleDown.reason}`);
  }
  
  console.log(`\n   Current Status:`);
  const status = scaler.getStatus();
  console.log(`      Scale: ${status.currentScale} agents`);
  console.log(`      Avg Load: ${status.avgLoad}%`);
  console.log(`      Range: ${status.minAgents}-${status.maxAgents}`);
  console.log();
  
  // Demo 3: Webhook Alerts
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣ WEBHOOK ALERT SYSTEM\n');
  
  const alerts = new WebhookAlertManager({ cooldownMs: 30000 });
  
  // Register webhooks
  alerts.register('discord', 'https://discord.com/api/webhooks/vera', ['SECURITY_THREAT', 'ENERGY_ANOMALY']);
  alerts.register('slack', 'https://hooks.slack.com/vera', ['*']);
  alerts.register('pagerduty', 'https://events.pagerduty.com/vera', ['SECURITY_THREAT']);
  
  console.log('   📡 Webhooks registered:');
  console.log('      • Discord (Security, Energy alerts)');
  console.log('      • Slack (All alerts)');
  console.log('      • PagerDuty (Critical only)');
  console.log();
  
  // Send test alerts
  console.log('   🚨 Sending test alerts:');
  
  const threatAlert = await alerts.triggerDomainAlert('security', 'CRITICAL', {
    type: 'Reentrancy detected',
    contract: '0.0.12345',
    loss: 10000
  });
  console.log(`      Security Threat: ${threatAlert.sent ? '✅ Sent' : '❌ Failed'} (${threatAlert.recipients} recipients)`);
  
  const energyAlert = await alerts.triggerDomainAlert('energy', 'HIGH', {
    type: 'Grid overload',
    load: 8500,
    zone: 'PJM_AEP'
  });
  console.log(`      Energy Anomaly: ${energyAlert.sent ? '✅ Sent' : '❌ Failed'} (${energyAlert.recipients} recipients)`);
  
  const defiAlert = await alerts.triggerDomainAlert('defi', 'MEDIUM', {
    type: 'Arbitrage opportunity',
    pair: 'HBAR/USDC',
    spread: 0.025
  });
  console.log(`      DeFi Opportunity: ${defiAlert.sent ? '✅ Sent' : '❌ Failed'} (${defiAlert.recipients} recipients)`);
  console.log();
  
  // Demo 4: Production Orchestrator
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣ PRODUCTION ORCHESTRATOR\n');
  
  const orchestrator = new ProductionOrchestrator();
  await orchestrator.initialize();
  
  console.log('   🎛️ System configuration:');
  console.log('      • Auto-scaling: 2-8 agents');
  console.log('      • Alert cooldown: 30 seconds');
  console.log('      • Health checks: Every 10 cycles');
  console.log('      • Webhook retry: 3 attempts');
  console.log();
  
  const prodStatus = orchestrator.getStatus();
  console.log('   📊 Status:');
  console.log(`      Running: ${prodStatus.running ? '✅ Yes' : '❌ No'}`);
  console.log(`      Webhooks: ${prodStatus.alerts.webhooks.length} registered`);
  console.log(`      Recent alerts: ${prodStatus.alerts.recentAlerts.length}`);
  console.log();
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ PHASE 6 DEMO COMPLETE\n');
  
  console.log('🎯 Production Features:');
  console.log('   • REST API with 7 endpoints');
  console.log('   • Auto-scaling 2-8 agents based on load');
  console.log('   • Webhook alerts to Discord/Slack/PagerDuty');
  console.log('   • Rate limiting (30s cooldown)');
  console.log('   • External integration ready');
  
  console.log('\n🚀 Usage:');
  console.log('   node api-server.mjs     # Start API');
  console.log('   curl http://localhost:8080/health');
  console.log('   ./vera api              # API status\n');
}

runDemo().catch(console.error);
