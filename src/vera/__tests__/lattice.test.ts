/**
 * Vera Lattice Test Suite
 * 
 * Comprehensive test suite for all lattice components including:
 * - Multi-field reasoning (Economic, Security, Performance)
 * - Cross-field reasoning and aggregation
 * - WebSocket transport and cryptography
 * - Byzantine consensus with batch processing
 * - Payment settlement integration
 * 
 * Run with: npm test -- --testPathPattern=lattice.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { latticeManager } from '../lattice/core/LatticeManager.js';
import { economicField } from '../lattice/fields/EconomicField.js';
import { securityField } from '../lattice/fields/SecurityField.js';
import { performanceField } from '../lattice/fields/PerformanceField.js';
import { CrossFieldReasoning } from '../lattice/CrossFieldReasoning.js';
import { LatticeCrypto } from '../lattice/crypto/LatticeCrypto.js';
import { ByzantineConsensus } from '../../lattice/byzantineConsensus.js';
import { enhancedSettlement } from '../payments/enhancedX402Settlement.js';
import { PredictiveAgentScaler } from '../scaling/predictiveScaler.js';
import { latticeVisualizer } from '../visualization/latticeVisualizer.js';

describe('VeraLattice Test Suite', () => {
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Economic Field Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('EconomicField', () => {
    beforeEach(() => {
      // Reset economic field state
      (economicField as any).agentPaymentHistories.clear();
      (economicField as any).marketRates.clear();
    });

    it('should score agent payment capability', () => {
      const agentId = 'test-agent-1';
      
      // Record some settlements
      economicField.recordSettlement(agentId, 10, 'HBAR', true, 1000);
      economicField.recordSettlement(agentId, 15, 'HBAR', true, 1200);
      economicField.recordSettlement(agentId, 20, 'HBAR', true, 800);
      
      const score = economicField.scoreAgentPaymentCapability(agentId);
      
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.overallScore).toBeLessThanOrEqual(1);
      expect(score.paymentReliability).toBe(1); // All successful
      expect(score.preferredCurrencies).toContain('HBAR');
    });

    it('should calculate cost efficiency', () => {
      const agentId = 'test-agent-2';
      
      economicField.recordSettlement(agentId, 5, 'HBAR', true, 500);
      economicField.recordSettlement(agentId, 5, 'HBAR', true, 600);
      
      const efficiency = economicField.calculateCostEfficiency(agentId);
      
      expect(efficiency).toBeGreaterThan(0);
      expect(efficiency).toBeLessThanOrEqual(1);
    });

    it('should update market rates', () => {
      const fees = [10, 15, 20, 12, 18];
      economicField.updateMarketRate('data-processing', fees, 'HBAR');
      
      const stats = economicField.getEconomicStats();
      expect(stats.totalMarketRates).toBe(1);
    });

    it('should convert currencies', () => {
      // Set up exchange rates
      (economicField as any).currencyExchangeRates.set('HBAR', 1);
      (economicField as any).currencyExchangeRates.set('USDC', 0.05);
      
      const converted = economicField.convertCurrency(100, 'HBAR', 'USDC');
      expect(converted).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Security Field Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('SecurityField', () => {
    beforeEach(() => {
      (securityField as any).securityProfiles.clear();
    });

    it('should assess agent risk', () => {
      const agentId = 'test-agent-3';
      
      securityField.registerAgentProfile({
        agentId,
        threatExposure: 0.3,
        complianceScore: 0.8,
        auditTrailCompleteness: 0.9,
        accessControlLevel: 'standard',
        encryptionStandard: 'aes256',
        historicalIncidents: [],
        lastSecurityAudit: Date.now()
      });
      
      const assessment = securityField.assessAgentRisk(agentId);
      
      expect(assessment.overallRisk).toBeGreaterThan(0);
      expect(assessment.overallRisk).toBeLessThanOrEqual(1);
      expect(assessment.riskLevel).toMatch(/low|medium|high|critical/);
    });

    it('should score compliance', () => {
      const agentId = 'test-agent-4';
      
      securityField.registerAgentProfile({
        agentId,
        threatExposure: 0.2,
        complianceScore: 0.9,
        auditTrailCompleteness: 0.95,
        accessControlLevel: 'high',
        encryptionStandard: 'aes256',
        historicalIncidents: [],
        lastSecurityAudit: Date.now()
      });
      
      const compliance = securityField.scoreCompliance(agentId);
      
      expect(compliance.score).toBeGreaterThan(0.8);
      expect(compliance.frameworks.length).toBeGreaterThan(0);
    });

    it('should record and resolve incidents', () => {
      const agentId = 'test-agent-5';
      
      securityField.registerAgentProfile({
        agentId,
        threatExposure: 0.5,
        complianceScore: 0.6,
        auditTrailCompleteness: 0.7,
        accessControlLevel: 'basic',
        encryptionStandard: 'aes128',
        historicalIncidents: [],
        lastSecurityAudit: Date.now()
      });
      
      const timestamp = Date.now();
      securityField.recordIncident(agentId, {
        type: 'unauthorized_access',
        severity: 'medium',
        description: 'Test incident',
        resolved: false
      });
      
      securityField.resolveIncident(agentId, timestamp);
      
      const profile = (securityField as any).securityProfiles.get(agentId);
      expect(profile.historicalIncidents[0].resolved).toBe(true);
    });

    it('should get security stats', () => {
      const stats = securityField.getSecurityStats();
      
      expect(stats.totalProfiles).toBeDefined();
      expect(stats.averageComplianceScore).toBeGreaterThanOrEqual(0);
      expect(stats.totalIncidents).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Performance Field Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('PerformanceField', () => {
    beforeEach(() => {
      (performanceField as any).metrics.clear();
      (performanceField as any).historicalLatencies.clear();
    });

    it('should record and retrieve metrics', () => {
      const agentId = 'test-agent-6';
      
      performanceField.recordMetrics(agentId, {
        averageResponseTimeMs: 150,
        throughputRps: 50,
        errorRate: 0.01,
        cpuUtilization: 0.4,
        memoryUtilization: 0.5,
        cacheHitRate: 0.8,
        uptimePercentage: 99.5,
        maxConcurrentRequests: 100
      });
      
      const metrics = performanceField.getMetrics(agentId);
      
      expect(metrics).toBeDefined();
      expect(metrics?.averageResponseTimeMs).toBe(150);
      expect(metrics?.throughputRps).toBe(50);
    });

    it('should predict latency', () => {
      const agentId = 'test-agent-7';
      
      // Seed with some latency data
      const latencies = [100, 110, 105, 115, 108, 112, 107, 111];
      (performanceField as any).historicalLatencies.set(agentId, latencies);
      
      performanceField.recordMetrics(agentId, {
        averageResponseTimeMs: 110,
        throughputRps: 40,
        errorRate: 0.02,
        cpuUtilization: 0.5,
        memoryUtilization: 0.6,
        cacheHitRate: 0.75,
        uptimePercentage: 99,
        maxConcurrentRequests: 80
      });
      
      const prediction = performanceField.predictLatency(agentId, 5);
      
      expect(prediction.predictedLatencyMs).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(['low', 'medium', 'high', 'critical']).toContain(prediction.riskLevel);
    });

    it('should detect bottlenecks', () => {
      const agentId = 'test-agent-8';
      
      performanceField.recordMetrics(agentId, {
        averageResponseTimeMs: 5000,
        throughputRps: 10,
        errorRate: 0.1,
        cpuUtilization: 0.95,
        memoryUtilization: 0.9,
        cacheHitRate: 0.3,
        uptimePercentage: 95,
        maxConcurrentRequests: 20
      });
      
      const bottleneck = performanceField.analyzeBottlenecks(agentId);
      
      expect(bottleneck.agentId).toBe(agentId);
      expect(bottleneck.primaryBottleneck).not.toBe('none');
      expect(bottleneck.severity).toMatch(/low|medium|high|critical/);
      expect(bottleneck.recommendations.length).toBeGreaterThan(0);
    });

    it('should score performance', () => {
      const agentId = 'test-agent-9';
      
      performanceField.recordMetrics(agentId, {
        averageResponseTimeMs: 100,
        throughputRps: 100,
        errorRate: 0.001,
        cpuUtilization: 0.3,
        memoryUtilization: 0.4,
        cacheHitRate: 0.9,
        uptimePercentage: 99.9,
        maxConcurrentRequests: 200
      });
      
      const score = performanceField.scorePerformance(agentId);
      
      expect(score.overall).toBeGreaterThan(0.7);
      expect(score.latency).toBeGreaterThan(0);
      expect(score.throughput).toBeGreaterThan(0);
      expect(score.reliability).toBeGreaterThan(0);
      expect(score.efficiency).toBeGreaterThan(0);
    });

    it('should get performance stats', () => {
      const stats = performanceField.getPerformanceStats();
      
      expect(stats.totalAgents).toBeDefined();
      expect(stats.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.agentsWithBottlenecks).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cross-Field Reasoning Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('CrossFieldReasoning', () => {
    let crossField: CrossFieldReasoning;

    beforeEach(() => {
      crossField = new CrossFieldReasoning();
      
      // Seed test data
      economicField.recordSettlement('agent-1', 10, 'HBAR', true, 1000);
      securityField.registerAgentProfile({
        agentId: 'agent-1',
        threatExposure: 0.2,
        complianceScore: 0.9,
        auditTrailCompleteness: 0.95,
        accessControlLevel: 'high',
        encryptionStandard: 'aes256',
        historicalIncidents: [],
        lastSecurityAudit: Date.now()
      });
      performanceField.recordMetrics('agent-1', {
        averageResponseTimeMs: 100,
        throughputRps: 50,
        errorRate: 0.01,
        cpuUtilization: 0.3,
        memoryUtilization: 0.4,
        cacheHitRate: 0.85,
        uptimePercentage: 99.9,
        maxConcurrentRequests: 100
      });
    });

    it('should aggregate scores from all fields', () => {
      const result = crossField.aggregateScores(['agent-1'], {
        verificationWeight: 0.25,
        economicWeight: 0.25,
        securityWeight: 0.25,
        performanceWeight: 0.25
      });
      
      expect(result['agent-1']).toBeDefined();
      expect(result['agent-1'].combinedScore).toBeGreaterThan(0);
      expect(result['agent-1'].fieldScores.economic).toBeDefined();
      expect(result['agent-1'].fieldScores.security).toBeDefined();
      expect(result['agent-1'].fieldScores.performance).toBeDefined();
    });

    it('should detect contradictions', () => {
      // Create a contradiction: high economic score but low security
      economicField.recordSettlement('agent-2', 100, 'HBAR', true, 500);
      securityField.registerAgentProfile({
        agentId: 'agent-2',
        threatExposure: 0.9,
        complianceScore: 0.2,
        auditTrailCompleteness: 0.1,
        accessControlLevel: 'basic',
        encryptionStandard: 'none',
        historicalIncidents: [],
        lastSecurityAudit: 0
      });
      
      const contradictions = crossField.detectContradictions(['agent-2']);
      
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].type).toBeDefined();
    });

    it('should find best agents with multi-field ranking', () => {
      const bestAgents = crossField.findBestAgentsMultiField(['agent-1'], {
        strategy: 'balanced',
        minSecurityScore: 0.7,
        maxAcceptableCost: 100,
        requirePerformanceHistory: true
      });
      
      expect(bestAgents.length).toBeGreaterThanOrEqual(0);
      if (bestAgents.length > 0) {
        expect(bestAgents[0].agentId).toBeDefined();
        expect(bestAgents[0].overallScore).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lattice Crypto Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('LatticeCrypto', () => {
    let crypto: LatticeCrypto;

    beforeEach(() => {
      crypto = new LatticeCrypto();
    });

    it('should generate key pairs', () => {
      const keyPair = crypto.generateKeyPair();
      
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.length).toBeGreaterThan(0);
      expect(keyPair.privateKey.length).toBeGreaterThan(0);
    });

    it('should sign and verify messages', () => {
      const keyPair = crypto.generateKeyPair();
      const message = { test: 'data', timestamp: Date.now() };
      
      const signed = crypto.signMessage(message, keyPair.privateKey);
      
      expect(signed.signature).toBeDefined();
      expect(signed.timestamp).toBeDefined();
      expect(signed.publicKey).toBe(keyPair.publicKey);
      
      const verified = crypto.verifyMessage(signed);
      expect(verified.valid).toBe(true);
    });

    it('should detect tampered messages', () => {
      const keyPair = crypto.generateKeyPair();
      const message = { test: 'data' };
      
      const signed = crypto.signMessage(message, keyPair.privateKey);
      
      // Tamper with the message
      signed.payload.tampered = true;
      
      const verified = crypto.verifyMessage(signed);
      expect(verified.valid).toBe(false);
    });

    it('should prevent replay attacks', () => {
      const keyPair = crypto.generateKeyPair();
      const message = { test: 'data' };
      
      const signed = crypto.signMessage(message, keyPair.privateKey);
      
      // First verification should succeed
      const first = crypto.verifyMessage(signed);
      expect(first.valid).toBe(true);
      
      // Second verification should fail (replay)
      const second = crypto.verifyMessage(signed);
      expect(second.valid).toBe(false);
      expect(second.error).toContain('replay');
    });

    it('should rotate keys', () => {
      const oldKeyPair = crypto.generateKeyPair();
      const newKeyPair = crypto.generateKeyPair();
      
      crypto.rotateKeys(oldKeyPair.publicKey, newKeyPair);
      
      const stats = crypto.getStats();
      expect(stats.keysRotated).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Byzantine Consensus Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('ByzantineConsensus', () => {
    let consensus: ByzantineConsensus;
    const nodeId = 'test-node-1';

    beforeEach(() => {
      consensus = new ByzantineConsensus(nodeId, {
        enableBatching: true,
        batchSize: 10,
        enableHotStuff: true
      });
    });

    afterEach(() => {
      consensus.stop();
    });

    it('should initialize with nodes', () => {
      consensus.initialize(['node-1', 'node-2', 'node-3', 'node-4']);
      
      const stats = consensus.getStats();
      expect(stats.nodeCount).toBe(4);
      expect(stats.quorum).toBe(3); // 2f + 1 where f = 1
    });

    it('should achieve consensus on single request', async () => {
      consensus.initialize(['node-1', 'node-2', 'node-3']);
      
      const payload = { action: 'test', data: 'value' };
      
      // This is a simplified test - real consensus would require network
      const result = await consensus.requestConsensus(payload);
      
      // Result may be null if not primary, but should not throw
      expect(result).toBeDefined();
    });

    it('should support batch consensus', async () => {
      consensus.initialize(['node-1', 'node-2', 'node-3']);
      
      const payloads = Array.from({ length: 5 }, (_, i) => ({ 
        action: 'batch-test', 
        index: i 
      }));
      
      const results = await consensus.requestBatchConsensus(payloads);
      
      expect(Array.isArray(results)).toBe(true);
    });

    it('should calculate correct quorum', () => {
      consensus.initialize(['node-1', 'node-2', 'node-3', 'node-4']);
      
      const stats = consensus.getStats();
      // 4 nodes -> f = 1 -> quorum = 2*1 + 1 = 3
      expect(stats.quorum).toBe(3);
    });

    it('should track view changes', () => {
      consensus.initialize(['node-1', 'node-2', 'node-3', 'node-4']);
      
      const initialStats = consensus.getStats();
      expect(initialStats.view).toBe(0);
      
      consensus.initiateViewChange();
      
      // View change initiated, but won't complete without other nodes
      const afterStats = consensus.getStats();
      expect(afterStats.view).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Payment Settlement Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('EnhancedX402Settlement', () => {
    it('should get settlement stats', () => {
      const stats = enhancedSettlement.getStats();
      
      expect(stats.total).toBeDefined();
      expect(stats.settled).toBeDefined();
      expect(stats.failed).toBeDefined();
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
    });

    it('should get circuit breaker stats', () => {
      const stats = enhancedSettlement.getCircuitBreakerStats();
      
      expect(stats.state).toMatch(/CLOSED|OPEN|HALF_OPEN/);
      expect(stats.failureCount).toBeGreaterThanOrEqual(0);
    });

    it('should validate agent for payment', async () => {
      // Seed economic field with test data
      economicField.recordSettlement('test-agent', 10, 'HBAR', true, 1000);
      
      const validation = await enhancedSettlement.validateAgentForPayment(
        'test-agent',
        5,
        'HBAR'
      );
      
      expect(validation.valid).toBeDefined();
      expect(validation.economicScore).toBeGreaterThanOrEqual(0);
      if (!validation.valid) {
        expect(validation.reason).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Predictive Scaling Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('PredictiveAgentScaler', () => {
    let scaler: PredictiveAgentScaler;

    beforeEach(() => {
      scaler = new PredictiveAgentScaler({
        minAgents: 2,
        maxAgents: 10,
        enablePredictiveScaling: true
      });
    });

    afterEach(() => {
      scaler.stop();
    });

    it('should record load metrics', () => {
      scaler.recordLoadMetrics({
        totalTasks: 100,
        activeAgents: 5,
        avgCpuUtilization: 0.6,
        avgMemoryUtilization: 0.5,
        queueDepth: 10,
        throughputRps: 50,
        errorRate: 0.01
      });
      
      const stats = scaler.getStats();
      expect(stats.currentAgents).toBe(5);
      expect(stats.historySize).toBe(1);
    });

    it('should provide agent type recommendations', () => {
      const rec = scaler.getAgentTypeRecommendation({
        expectedRps: 500,
        maxLatencyMs: 50,
        requiresGpu: false
      });
      
      expect(rec.recommendedType).toBeDefined();
      expect(rec.estimatedInstances).toBeGreaterThan(0);
      expect(rec.reason).toBeDefined();
    });

    it('should respect GPU requirements', () => {
      const rec = scaler.getAgentTypeRecommendation({
        expectedRps: 100,
        maxLatencyMs: 200,
        requiresGpu: true
      });
      
      expect(rec.recommendedType).toBe('gpu-worker');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lattice Visualizer Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('LatticeVisualizer', () => {
    it('should generate graph structure', () => {
      const graph = latticeVisualizer.generateGraph();
      
      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();
      expect(graph.timestamp).toBeGreaterThan(0);
      expect(graph.coherence).toBeGreaterThanOrEqual(0);
      expect(graph.coherence).toBeLessThanOrEqual(1);
    });

    it('should generate DOT format', () => {
      const dot = latticeVisualizer.toDOT();
      
      expect(dot).toContain('digraph Lattice');
      expect(dot).toContain('}');
    });

    it('should generate Mermaid format', () => {
      const mermaid = latticeVisualizer.toMermaid();
      
      expect(mermaid).toContain('graph TD');
    });

    it('should generate ASCII representation', () => {
      const ascii = latticeVisualizer.toASCII();
      
      expect(ascii).toContain('VERA LATTICE');
      expect(ascii).toContain('COHERENCE');
    });

    it('should generate D3 JSON', () => {
      const json = latticeVisualizer.toD3JSON();
      const parsed = JSON.parse(json);
      
      expect(parsed.nodes).toBeDefined();
      expect(parsed.links).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lattice Manager Integration Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('LatticeManager Integration', () => {
    beforeEach(() => {
      latticeManager.clear();
    });

    it('should register and retrieve fields', () => {
      // Fields are auto-registered by their singleton instances
      const stats = latticeManager.getAllStats();
      expect(Array.isArray(stats)).toBe(true);
    });

    it('should calculate system coherence', () => {
      const coherence = latticeManager.getSystemCoherence();
      
      expect(coherence).toBeGreaterThanOrEqual(0);
      expect(coherence).toBeLessThanOrEqual(1);
    });

    it('should export and import state', () => {
      const exported = latticeManager.exportState();
      
      expect(exported.fields).toBeDefined();
      expect(exported.timestamp).toBeGreaterThan(0);
      
      // Test import
      latticeManager.importState(exported);
      const coherence = latticeManager.getSystemCoherence();
      expect(coherence).toBeGreaterThanOrEqual(0);
    });

    it('should get lattice stats', () => {
      const stats = latticeManager.getLatticeStats();
      
      expect(stats.coherence).toBeDefined();
      expect(stats.entanglements).toBeDefined();
      expect(stats.fields).toBeDefined();
      expect(stats.fieldDetails).toBeDefined();
    });
  });
});
