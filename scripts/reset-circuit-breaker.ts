#!/usr/bin/env tsx
/**
 * Reset Circuit Breaker Script
 * Resets all circuit breakers to CLOSED state
 */

import { X402SettlementHandler } from '../src/vera/orchestrator/x402Settlement.js';

function resetCircuitBreakers() {
  console.log('🔓 Resetting Circuit Breakers...\n');
  
  // Create a settlement handler instance
  const handler = new X402SettlementHandler();
  
  // Reset circuit breaker
  handler.resetCircuitBreaker();
  
  console.log('✅ Circuit breaker reset to CLOSED state');
  console.log('   All services should now process normally');
}

resetCircuitBreakers();
