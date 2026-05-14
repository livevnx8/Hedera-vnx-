#!/usr/bin/env tsx
/**
 * Force Backup Script
 * Creates an immediate state backup
 */

import { StateBackupManager } from '../src/vera/disaster-recovery/stateBackup.js';

async function forceBackup() {
  console.log('💾 Creating forced state backup...\n');
  
  const backup = new StateBackupManager({
    intervalMs: 60000,
    retentionCount: 12,
    backupPath: './backups',
    compressBackups: true,
  });
  
  try {
    const snapshot = await backup.forceBackup('manual');
    
    console.log('✅ Backup created successfully');
    console.log(`   ID: ${snapshot.id}`);
    console.log(`   Timestamp: ${new Date(snapshot.timestamp).toISOString()}`);
    console.log(`   Size: ${(snapshot.size / 1024).toFixed(1)} KB`);
    console.log(`   Checksum: ${snapshot.checksum}`);
    console.log(`   Agents: ${snapshot.metadata.agentCount}`);
    console.log(`   Topics: ${snapshot.metadata.topicCount}`);
  } catch (error) {
    console.error('❌ Backup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

forceBackup();
