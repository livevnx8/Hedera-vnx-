#!/usr/bin/env tsx
/**
 * Security Audit Script
 * Runs security checks and compliance validation
 */

import { SecurityManager } from '../src/vera/security/compliance.js';

function runSecurityAudit() {
  console.log('🔒 Running Security Audit...\n');
  
  const security = new SecurityManager({
    enableEncryption: true,
    encryptionKey: process.env.ENCRYPTION_KEY || 'test-key-123456789012345678901234567890',
    auditLogRetention: 30,
    requireMFA: false,
    maxLoginAttempts: 3,
    sessionTimeout: 60,
  });
  
  // Test encryption
  console.log('Testing encryption...');
  const testData = 'sensitive-payment-data-12345';
  const encrypted = security.encrypt(testData);
  const decrypted = security.decrypt(encrypted);
  
  if (decrypted === testData) {
    console.log('✅ Encryption/Decryption working');
  } else {
    console.log('❌ Encryption test failed');
    process.exit(1);
  }
  
  // Test access control
  console.log('\nTesting access control...');
  const access = security.validateAccess({
    userId: 'test-user',
    resource: 'payment',
    action: 'create',
    ip: '127.0.0.1',
  });
  
  if (access.allowed) {
    console.log('✅ Access control working');
  } else {
    console.log('❌ Access control rejected valid request');
  }
  
  // Get SOC2 metrics
  console.log('\n📊 SOC2 Compliance Metrics:');
  const metrics = security.getSOC2Metrics();
  console.log(`   Total audit events: ${metrics.totalEvents}`);
  console.log(`   Failed events: ${metrics.failedEvents}`);
  console.log(`   Active sessions: ${metrics.activeSessions}`);
  console.log(`   Encryption enabled: ${metrics.encryptionEnabled ? '✅' : '❌'}`);
  console.log(`   Audit retention: ${metrics.auditRetention} days`);
  
  console.log('\n✅ Security audit complete');
}

runSecurityAudit();
