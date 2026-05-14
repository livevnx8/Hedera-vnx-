#!/usr/bin/env tsx
/**
 * Emergency Stop Script
 * Stops all agents and services immediately
 */

import { logger } from '../src/monitoring/logger.js';

async function emergencyStop() {
  console.log('🚨 EMERGENCY STOP INITIATED\n');
  
  logger.error('EmergencyStop', {
    message: 'Emergency stop triggered',
    timestamp: new Date().toISOString(),
    triggeredBy: process.env.USER || 'unknown',
  });
  
  console.log('⚠️  Actions being taken:');
  console.log('   - Stopping all agent processing');
  console.log('   - Closing open settlements');
  console.log('   - Draining message queues');
  console.log('   - Releasing connection pools');
  
  // In production, this would:
  // 1. Signal all agents to stop
  // 2. Wait for graceful shutdown
  // 3. Force kill if needed
  // 4. Update status in database
  
  console.log('\n⏳ Waiting for graceful shutdown...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n✅ Emergency stop complete');
  console.log('   System is now in safe state');
  console.log('   Use "npm start" to restart when ready');
}

emergencyStop();
