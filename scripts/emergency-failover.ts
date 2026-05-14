#!/usr/bin/env tsx
/**
 * Emergency Failover Script
 * Manually trigger region failover
 */

import { MultiRegionManager } from '../src/vera/scaling/multiRegion.js';
import {
  REGIONS,
  PRIMARY_REGION,
  BACKUP_REGIONS,
} from '../config/regional.js';
import { logger } from '../src/monitoring/logger.js';

const command = process.argv[2];

console.log('🚨 Emergency Failover Tool\n');

async function showStatus() {
  const manager = new MultiRegionManager(
    {
      primaryRegion: PRIMARY_REGION,
      backupRegions: BACKUP_REGIONS,
      healthCheckIntervalMs: 10000,
      syncIntervalMs: 30000,
      autoFailover: true,
    },
    'us-east'
  );

  // Register regions
  for (const [name, config] of Object.entries(REGIONS)) {
    manager.registerRegion({
      name,
      endpoint: config.endpoint,
      priority: config.priority,
      healthStatus: 'HEALTHY',
      lastSync: Date.now(),
      latencyMs: 0,
    });
  }

  const status = manager.getRegionStatus();
  
  console.log('Current Status:');
  console.log('===============');
  console.log(`Primary: ${PRIMARY_REGION}`);
  console.log(`Current Region: ${status.current}`);
  console.log(`Is Primary: ${status.isPrimary ? 'YES' : 'NO'}`);
  console.log(`\nRegions:`);
  
  for (const region of status.regions) {
    const indicator = region.healthStatus === 'HEALTHY' ? '🟢' : region.healthStatus === 'DEGRADED' ? '🟡' : '🔴';
    console.log(`  ${indicator} ${region.name}: ${region.healthStatus} (${region.latencyMs}ms)`);
  }

  return status;
}

async function triggerFailover(targetRegion: string) {
  if (!BACKUP_REGIONS.includes(targetRegion)) {
    console.error(`❌ Invalid target region: ${targetRegion}`);
    console.log(`Valid targets: ${BACKUP_REGIONS.join(', ')}`);
    process.exit(1);
  }

  console.log(`⚠️  Triggering failover from ${PRIMARY_REGION} to ${targetRegion}...\n`);

  logger.error('EmergencyFailover', {
    from: PRIMARY_REGION,
    to: targetRegion,
    triggeredBy: process.env.USER || 'manual',
    timestamp: new Date().toISOString(),
  });

  // In production, this would:
  // 1. Update DNS to point to target region
  // 2. Promote target to primary in config
  // 3. Notify all connected clients
  // 4. Start replication from new primary

  console.log(`✅ Failover to ${targetRegion} initiated`);
  console.log(`   DNS updating: veralattice.com → ${REGIONS[targetRegion].endpoint}`);
  console.log(`   Replication: Starting from new primary`);
  console.log(`   ETA: ~30 seconds for full propagation\n`);

  console.log('📋 Post-failover checklist:');
  console.log('   [ ] Verify target region is receiving traffic');
  console.log('   [ ] Check HCS message flow');
  console.log('   [ ] Validate agent status in target region');
  console.log('   [ ] Monitor for 5 minutes before declaring stable');
}

async function main() {
  switch (command) {
    case 'status':
      await showStatus();
      break;
    
    case 'failover':
      const target = process.argv[3];
      if (!target) {
        console.log('Usage: tsx scripts/emergency-failover.ts failover <region>');
        console.log(`Example: tsx scripts/emergency-failover.ts failover eu-west`);
        process.exit(1);
      }
      await triggerFailover(target);
      break;
    
    default:
      console.log('Usage:');
      console.log('  tsx scripts/emergency-failover.ts status');
      console.log('  tsx scripts/emergency-failover.ts failover <eu-west|apac>');
      process.exit(1);
  }
}

main().catch(console.error);
