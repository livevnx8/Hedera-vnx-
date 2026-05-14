#!/usr/bin/env tsx
/**
 * Regional Deployment Script
 * Deploys VeraLattice to multiple regions
 */

import { MultiRegionManager } from '../src/vera/scaling/multiRegion.js';
import {
  REGIONS,
  CURRENT_REGION,
  PRIMARY_REGION,
  BACKUP_REGIONS,
  HEALTH_CHECK_CONFIG,
  SYNC_CONFIG,
  FAILOVER_CONFIG,
} from '../config/regional.js';
import { logger } from '../src/monitoring/logger.js';

console.log('🌍 VeraLattice Multi-Region Deployment\n');

async function deployRegions() {
  console.log('📋 Deployment Configuration:');
  console.log(`  Primary: ${PRIMARY_REGION}`);
  console.log(`  Backups: ${BACKUP_REGIONS.join(', ')}`);
  console.log(`  Current: ${CURRENT_REGION}\n`);

  // Initialize multi-region manager
  const manager = new MultiRegionManager(
    {
      primaryRegion: PRIMARY_REGION,
      backupRegions: BACKUP_REGIONS,
      healthCheckIntervalMs: HEALTH_CHECK_CONFIG.intervalMs,
      syncIntervalMs: SYNC_CONFIG.intervalMs,
      autoFailover: FAILOVER_CONFIG.autoFailover,
    },
    CURRENT_REGION
  );

  // Register all regions
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

  console.log('✅ Regions registered:\n');
  for (const [name, region] of Object.entries(REGIONS)) {
    console.log(`  🌐 ${name.toUpperCase()}:`);
    console.log(`     Endpoint: ${region.endpoint}`);
    console.log(`     HCS Topic: ${region.hcsTopicId}`);
    console.log(`     Capacity: ${region.capacity.maxAgents} agents, ${region.capacity.maxHcsPerSecond} HCS/s`);
    console.log(`     Location: ${region.geoLocation.lat}, ${region.geoLocation.lon}\n`);
  }

  // Start coordination
  manager.start();

  console.log('🚀 Multi-region coordination started!\n');

  // Print status
  const status = manager.getRegionStatus();
  console.log(`📊 Current Region: ${status.current}`);
  console.log(`   Is Primary: ${status.isPrimary ? 'YES' : 'NO'}`);
  console.log(`   Healthy Regions: ${status.regions.filter(r => r.healthStatus === 'HEALTHY').length}/${status.regions.length}\n`);

  console.log('🎯 Next Steps:');
  console.log('  1. Deploy to US-East (primary)');
  console.log('  2. Deploy to EU-West (backup)');
  console.log('  3. Deploy to APAC (backup)');
  console.log('  4. Configure Geo-DNS routing');
  console.log('  5. Test cross-region failover\n');

  // Keep running for health checks
  setInterval(() => {
    const status = manager.getRegionStatus();
    logger.info('RegionalDeployment', {
      current: status.current,
      isPrimary: status.isPrimary,
      healthyRegions: status.regions.filter(r => r.healthStatus === 'HEALTHY').length,
      totalRegions: status.regions.length,
    });
  }, 30000);
}

deployRegions().catch(error => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
