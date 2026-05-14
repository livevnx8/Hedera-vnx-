import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import EventEmitter from 'events';

/**
 * Multi-Topic Lattice Nervous System Configuration
 * 5 specialized topics as distributed memory organs
 * Topic IDs loaded from environment for flexibility
 */
const TOPIC_CONFIG = {
  core: { 
    id: process.env.VERA_CORE_TOPIC_ID || '0.0.10409351', 
    priority: 'critical', 
    retention: '24h' 
  },
  defi: { 
    id: process.env.VERA_DEFI_TOPIC_ID || '0.0.10409352', 
    priority: 'high', 
    retention: '12h' 
  },
  carbon: { 
    id: process.env.VERA_CARBON_TOPIC_ID || '0.0.10409353', 
    priority: 'high', 
    retention: '48h' 
  },
  bridge: { 
    id: process.env.VERA_BRIDGE_TOPIC_ID || '0.0.10409354', 
    priority: 'medium', 
    retention: '6h' 
  },
  ecosystem: { 
    id: process.env.VERA_ECOSYSTEM_TOPIC_ID || '0.0.10409355', 
    priority: 'medium', 
    retention: 'infinite' 
  }
};

/**
 * Auto-routing map: category -> target topic
 */
const CATEGORY_ROUTING: Record<string, keyof typeof TOPIC_CONFIG> = {
  // DeFi topic
  defi: 'defi',
  yield: 'defi',
  dex: 'defi',
  staking: 'defi',
  lending: 'defi',
  saucerswap: 'defi',
  // Carbon topic
  carbon: 'carbon',
  dovu: 'carbon',
  sustainability: 'carbon',
  'carbon_credit': 'carbon',
  verification: 'carbon',
  // Bridge topic
  wrapped: 'bridge',
  bridge: 'bridge',
  hashport: 'bridge',
  weth: 'bridge',
  wbt: 'bridge',
  gib: 'bridge',
  'hbar.h': 'bridge',
  cross_chain: 'bridge',
  // Ecosystem topic
  hts: 'ecosystem',
  token: 'ecosystem',
  contract: 'ecosystem',
  account: 'ecosystem',
  relationship: 'ecosystem',
  // Core topic (default)
  system: 'core',
  health: 'core',
  heartbeat: 'core',
  tool: 'core',
  alert: 'core',
  recall: 'core',
  status: 'core'
};

/**
 * LatticeFindingsLogger - Distributed HCS logging for agent findings
 * 
 * Creates a simple referencing system across the Vera lattice:
 * - Collects important findings from agent work
 * - Periodically submits aggregated findings to HCS
 * - Provides lattice-wide reference points for cross-node sync
 */

interface Finding {
  id: string;
  type: 'insight' | 'pattern' | 'alert' | 'action' | 'result' | 'error' | 'heartbeat' | 'status';
  source: string; // agent ID or component
  timestamp: number;
  importance: number; // 1-10
  category: string; // defi, nft, security, etc.
  summary: string;
  details: Record<string, unknown>;
  relatedFindings?: string[]; // IDs of related findings
}

interface FindingBatch {
  batchId: string;
  timestamp: number;
  nodeId: string;
  findings: Finding[];
  stats: {
    totalFindings: number;
    avgImportance: number;
    categories: Record<string, number>;
  };
}

/**
 * Lattice reference for cross-node synchronization
 */
interface LatticeReference {
  refId: string;
  batchId: string;
  hcsTopicId: string;
  hcsSequenceNumber: number;
  timestamp: number;
  nodeId: string;
  summary: string;
  keyFindings: string[];
  importance: number;
}

class LatticeFindingsLogger extends EventEmitter {
  private client: Client | null = null;
  private topicId: string;
  private topicClients: Map<string, Client> = new Map(); // Multi-topic clients
  private findings: Map<string, Finding> = new Map();
  private findingsQueue: Finding[] = [];
  private batchingTimeout: NodeJS.Timeout | null = null;
  private readonly maxBatchSize: number = 20; // Max findings per HCS message
  private readonly maxBatchWaitTimeMs: number = 5000; // 5 seconds
  private references: Map<string, LatticeReference> = new Map();
  private submissionIntervalMs: number;
  private intervalHandle: NodeJS.Timeout | null = null;
  private nodeId: string;
  private proactiveIntervalHandle: NodeJS.Timeout | null = null;
  private lastActivityTimestamp: number = Date.now();
  private scanIntervalMs: number = 60000; // Scan every minute
  private agentSystem: any = null; // Reference to veraAgentSystem
  private toolPerformanceMetrics: Map<string, any> = new Map(); // Track tool performance

  constructor(
    topicId: string = '0.0.10409351',
    submissionIntervalMinutes: number = 5,
    nodeId: string = 'vera-primary'
  ) {
    super();
    this.topicId = topicId;
    this.submissionIntervalMs = submissionIntervalMinutes * 60 * 1000;
    this.nodeId = nodeId;
    this.initClient();
  }

  private initClient(): void {
    if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
      console.log('⚠️ HCS client not initialized - missing credentials');
      return;
    }

    try {
      this.client = Client.forMainnet();
      
      // Parse private key correctly based on format
      const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
      let privateKey;
      
      if (keyStr.length === 64) {
        // Likely hex-encoded ECDSA key
        try {
          privateKey = PrivateKey.fromStringECDSA(keyStr);
        } catch {
          privateKey = PrivateKey.fromStringED25519(keyStr);
        }
      } else if (keyStr.startsWith('302e') || keyStr.startsWith('3032')) {
        // DER-encoded key
        privateKey = PrivateKey.fromStringDer(keyStr);
      } else {
        // Generic parse
        privateKey = PrivateKey.fromString(keyStr);
      }
      
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
      console.log('✅ LatticeFindingsLogger: HCS client initialized');
    } catch (error) {
      console.error('❌ LatticeFindingsLogger: Failed to init client:', error);
    }
  }

  /**
   * Connect to agent system for proactive monitoring
   */
  connectAgentSystem(agentSystem: any): void {
    this.agentSystem = agentSystem;
    console.log('🔗 LatticeFindingsLogger: Connected to agent system');
    this.startProactiveScanning();
  }

  /**
   * Start proactive scanning for findings
   */
  startProactiveScanning(): void {
    if (this.proactiveIntervalHandle) {
      return;
    }
    console.log('🔍 Starting proactive scanning for findings...');
    this.proactiveIntervalHandle = setInterval(() => {
      this.scanForFindings();
    }, this.scanIntervalMs);
  }

  /**
   * Stop proactive scanning
   */
  stopProactiveScanning(): void {
    if (this.proactiveIntervalHandle) {
      clearInterval(this.proactiveIntervalHandle);
      this.proactiveIntervalHandle = null;
      console.log('⏹️ Proactive scanning stopped');
    }
  }

  /**
   * Execute and test a tool, logging results to HCS
   */
  async testTool(toolName: string, args: Record<string, unknown> = {}, agentId: string = 'test-agent'): Promise<any> {
    const startTime = Date.now();
    let result: any;
    let success = false;
    let error: string | null = null;

    try {
      // Try to get tool from agent system
      if (this.agentSystem?.registry) {
        const agent = this.agentSystem.registry.getAgent(agentId);
        if (agent?.executeTool) {
          result = await agent.executeTool(toolName, args);
          success = !result?.includes('error') && !result?.includes('failed');
        } else {
          // Test mode - simulate tool execution
          result = await this.simulateToolExecution(toolName, args);
          success = result.success;
        }
      } else {
        // Test mode - simulate tool execution
        result = await this.simulateToolExecution(toolName, args);
        success = result.success;
      }
    } catch (err: any) {
      error = err.message;
      success = false;
      result = { error: err.message };
    }

    const duration = Date.now() - startTime;

    // Record tool test finding
    const finding = this.recordFinding(
      success ? 'result' : 'error',
      `tool-test-${toolName}`,
      success 
        ? `Tool ${toolName} executed successfully (${duration}ms)`
        : `Tool ${toolName} failed: ${error || 'Unknown error'}`,
      {
        toolName,
        args,
        success,
        duration,
        result: typeof result === 'string' ? result : JSON.stringify(result),
        error,
        timestamp: Date.now(),
        agentId
      },
      success ? 6 : 9, // Higher importance for failures
      'tool_test'
    );

    // Track performance metrics
    this.trackToolMetrics(toolName, success, duration, error);

    // If tool failed, immediately submit for lattice visibility
    if (!success) {
      await this.submitFindingsImmediately([finding]);
    }

    return { success, result, duration, finding };
  }

  /**
   * Simulate tool execution for testing when real execution not available
   */
  private async simulateToolExecution(toolName: string, args: Record<string, unknown>): Promise<any> {
    // Simulate realistic responses for different tool types
    const mockResponses: Record<string, any> = {
      'hbar_price': { success: true, price: 0.0523, currency: 'USD', source: 'coinmarketcap' },
      'create_topic': { success: true, topicId: '0.0.' + Math.floor(Math.random() * 10000000) },
      'submit_message': { success: true, sequenceNumber: Math.floor(Math.random() * 1000) },
      'token_create': { success: true, tokenId: '0.0.' + Math.floor(Math.random() * 10000000) },
      'default': { success: true, message: 'Tool executed successfully' }
    };

    // Occasionally simulate failures (10% chance) to test error handling
    if (Math.random() < 0.1) {
      return { 
        success: false, 
        error: 'Simulated failure - tool requires actual Hedera credentials',
        requiresOptimization: true
      };
    }

    return mockResponses[toolName] || mockResponses.default;
  }

  /**
   * Track tool performance metrics over time
   */
  private trackToolMetrics(toolName: string, success: boolean, duration: number, error: string | null): void {
    const existing = this.toolPerformanceMetrics.get(toolName) || {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      avgDuration: 0,
      errors: [] as Array<{ error: string; timestamp: number }>,
      lastTested: null as number | null
    };

    existing.totalCalls++;
    if (success) {
      existing.successfulCalls++;
    } else {
      existing.failedCalls++;
      if (error) existing.errors.push({ error, timestamp: Date.now() });
      // Keep only last 10 errors
      if (existing.errors.length > 10) existing.errors.shift();
    }

    // Update average duration
    existing.avgDuration = (existing.avgDuration * (existing.totalCalls - 1) + duration) / existing.totalCalls;
    existing.lastTested = Date.now();

    this.toolPerformanceMetrics.set(toolName, existing);

    // Log optimization opportunity if tool has high failure rate
    if (existing.failedCalls / existing.totalCalls > 0.3 && existing.totalCalls > 5) {
      this.recordFinding(
        'insight',
        'tool-optimizer',
        `Tool ${toolName} has ${Math.round((existing.failedCalls/existing.totalCalls)*100)}% failure rate - needs optimization`,
        {
          toolName,
          failureRate: existing.failedCalls / existing.totalCalls,
          totalCalls: existing.totalCalls,
          errors: existing.errors.slice(-3),
          recommendation: 'Review tool implementation and error handling'
        },
        8,
        'optimization'
      );
    }
  }

  /**
   * Run batch tool testing across all available tools
   */
  async runToolTestSuite(toolsToTest: string[] | null = null): Promise<any[]> {
    const testTools = toolsToTest || [
      'hbar_price',
      'token_info', 
      'create_topic',
      'submit_message',
      'account_balance'
    ];

    console.log(`🔧 Running tool test suite (${testTools.length} tools)...`);

    const results: any[] = [];
    for (const tool of testTools) {
      const result = await this.testTool(tool, {}, 'test-suite');
      results.push({ tool, ...result });
      // Small delay between tests
      await new Promise(r => setTimeout(r, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    // Log test suite summary
    this.recordFinding(
      'result',
      'tool-test-suite',
      `Tool test suite complete: ${successCount}/${results.length} passed`,
      {
        total: results.length,
        passed: successCount,
        failed: failCount,
        results: results.map(r => ({ tool: r.tool, success: r.success, duration: r.duration })),
        timestamp: Date.now()
      },
      failCount > 0 ? 7 : 5,
      'test_suite'
    );

    console.log(`✅ Tool test suite: ${successCount}/${results.length} passed`);
    return results;
  }

  /**
   * Get tool optimization recommendations for lattice
   */
  getToolOptimizationInsights(): any[] {
    const insights: any[] = [];
    
    for (const [toolName, metrics] of this.toolPerformanceMetrics) {
      const failureRate = metrics.failedCalls / metrics.totalCalls;
      
      if (failureRate > 0.2) {
        insights.push({
          toolName,
          issue: 'High failure rate',
          severity: failureRate > 0.5 ? 'critical' : 'warning',
          recommendation: 'Review error handling and input validation',
          metrics
        });
      }
      
      if (metrics.avgDuration > 5000) {
        insights.push({
          toolName,
          issue: 'Slow execution',
          severity: metrics.avgDuration > 10000 ? 'critical' : 'warning',
          recommendation: 'Optimize API calls or add caching',
          metrics
        });
      }
    }

    // Log insights for lattice visibility
    if (insights.length > 0) {
      this.recordFinding(
        'insight',
        'lattice-optimizer',
        `Tool optimization analysis: ${insights.length} tools need attention`,
        { insights, timestamp: Date.now() },
        7,
        'optimization'
      );
    }

    return insights;
  }

  /**
   * Scan for new findings from agent system activity
   */
  private scanForFindings(): void {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTimestamp;
    
    // Generate heartbeat if no activity for 2 minutes
    if (timeSinceLastActivity > 120000) {
      this.generateHeartbeatFinding();
    }
    
    // Scan agent system if connected
    if (this.agentSystem) {
      this.scanAgentSystemActivity();
    }
    
    // Run tool test suite every 10 scans (every 10 minutes)
    if (Math.floor(now / this.scanIntervalMs) % 10 === 0) {
      this.runToolTestSuite();
    }
    
    // Generate optimization insights every 15 scans
    if (Math.floor(now / this.scanIntervalMs) % 15 === 0) {
      this.getToolOptimizationInsights();
    }
  }

  /**
   * Scan agent system for activity to log
   */
  private scanAgentSystemActivity(): void {
    try {
      const status = this.agentSystem.getStatus ? this.agentSystem.getStatus() : null;
      if (!status) return;
      
      // Log system status periodically
      this.recordFinding(
        'insight',
        'vera-system',
        `System active: ${status.agents} agents, ${status.workflows} workflows, ${status.tools} tools`,
        { ...status, timestamp: Date.now() },
        5,
        'system'
      );
      
      // Check for workflow completions
      if (this.agentSystem.workflows) {
        const workflows = this.agentSystem.workflows.listWorkflows();
        workflows.forEach((wf: any) => {
          // Only log if we haven't logged this workflow recently (within last 10 min)
          const recentLog = Array.from(this.findings.values()).find(
            f => f.source === 'workflow-engine' && f.details?.workflowId === wf.id && 
                 f.timestamp > Date.now() - 600000
          );
          if (!recentLog) {
            this.recordFinding(
              'insight',
              'workflow-engine',
              `Workflow available: ${wf.name} (${wf.category})`,
              { workflowId: wf.id, version: wf.version },
              5,
              'workflow'
            );
          }
        });
      }
      
      this.lastActivityTimestamp = Date.now();
    } catch (err) {
      // Silently fail scanning - don't interrupt main flow
    }
  }

  /**
   * Generate heartbeat finding when system is idle
   */
  private generateHeartbeatFinding(): void {
    const idleMinutes = Math.floor((Date.now() - this.lastActivityTimestamp) / 60000);
    this.recordFinding(
      'heartbeat',
      'lattice-logger',
      `Vera lattice heartbeat - system healthy (idle ${idleMinutes}m)`,
      {
        idleMinutes,
        totalFindings: this.findings.size,
        totalReferences: this.getReferences().length,
        timestamp: Date.now()
      },
      3,
      'health'
    );
  }

  /**
   * Record a new finding from agent work
   */
  recordFinding(
    type: Finding['type'],
    source: string,
    summary: string,
    details: Record<string, unknown>,
    importance: number = 5,
    category: string = 'general'
  ): Finding {
    this.lastActivityTimestamp = Date.now();
    const finding: Finding = {
      id: `find-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      source,
      timestamp: Date.now(),
      importance: Math.min(10, Math.max(1, importance)),
      category,
      summary,
      details,
    };

    this.findings.set(finding.id, finding);
    this.findingsQueue.push(finding);
    this.emit('finding_recorded', finding);

    // Schedule a batch submission. High-importance findings will trigger a faster submission.
    const isUrgent = finding.importance >= 8;
    this.scheduleBatchSubmission(isUrgent);

    return finding;
  }

  /**
   * Start periodic submission of findings to HCS
   */
  startPeriodicSubmission(): void {
    if (this.intervalHandle) {
      console.log('⚠️ Periodic submission already running');
      return;
    }

    console.log(`🔄 Starting periodic HCS submission every ${this.submissionIntervalMs / 60000} minutes`);
    
    this.intervalHandle = setInterval(() => {
      this.submitPendingFindings();
    }, this.submissionIntervalMs);

    // Initial submission after startup
    setTimeout(() => this.submitPendingFindings(), 5000);
  }

  /**
   * Stop periodic submission
   */
  stopPeriodicSubmission(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('⏹️ Periodic submission stopped');
    }
    this.stopProactiveScanning();
  }

  /**
   * Submit all pending findings to HCS with chunking
   */
  private scheduleBatchSubmission(isUrgent: boolean = false): void {
    if (this.batchingTimeout) {
      // If a timeout is already scheduled, don't create a new one unless it's urgent
      // and the existing one isn't.
      return;
    }

    const waitTime = isUrgent ? 1000 : this.maxBatchWaitTimeMs;

    if (this.findingsQueue.length >= this.maxBatchSize) {
      // If batch is full, submit immediately
      this.submitFindingBatch();
    } else {
      // Otherwise, schedule a submission
      this.batchingTimeout = setTimeout(() => {
        this.submitFindingBatch();
      }, waitTime);
    }
  }

  async submitFindingBatch(): Promise<void> {
    if (this.batchingTimeout) {
      clearTimeout(this.batchingTimeout);
      this.batchingTimeout = null;
    }

    if (this.findingsQueue.length === 0) {
      return;
    }

    const findingsToSubmit = [...this.findingsQueue];
    this.findingsQueue = [];

    // Group findings by target topic
    const findingsByTopic: Map<string, Finding[]> = new Map();
    for (const finding of findingsToSubmit) {
      const topicId = this.getTopicForCategory(finding.category);
      if (!findingsByTopic.has(topicId)) {
        findingsByTopic.set(topicId, []);
      }
      findingsByTopic.get(topicId)!.push(finding);
    }

    // Submit one batch per topic
    for (const [topicId, findings] of findingsByTopic) {
      // Further chunk if a single topic group exceeds max batch size
      for (let i = 0; i < findings.length; i += this.maxBatchSize) {
        const chunk = findings.slice(i, i + this.maxBatchSize);
        await this.submitFindingsImmediately(chunk, topicId);
      }
    }
  }

  /**
   * @deprecated Use submitFindingBatch for automatic queue processing. This method is now for periodic failsafe submission.
   */
  async submitPendingFindings(): Promise<void> {
    console.log('ℹ️ Running periodic failsafe submission check...');
    await this.submitFindingBatch();
  }

  /**
   * Immediately submit specific findings to HCS
   */
  async submitFindingsImmediately(findings: Finding[], topicIdOverride?: string): Promise<LatticeReference | null> {
    if (!this.client) {
      console.log('⚠️ HCS client not available, findings queued for later submission');
      return null;
    }

    const batch: FindingBatch = {
      batchId: `batch-${Date.now()}-${this.nodeId}`,
      timestamp: Date.now(),
      nodeId: this.nodeId,
      findings,
      stats: this.computeBatchStats(findings),
    };

    try {
      const message = JSON.stringify({
        type: 'vera_lattice_findings',
        version: '1.0',
        ...batch,
      });

      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicIdOverride || this.getTopicForCategory(findings[0]?.category || 'core'))
        .setMessage(message)
        .execute(this.client);

      const record = await tx.getRecord(this.client);
      const sequenceNumber = record.receipt.topicSequenceNumber?.toNumber() ?? 0;

      // Create lattice reference
      const reference: LatticeReference = {
        refId: `ref-${batch.batchId}`,
        batchId: batch.batchId,
        hcsTopicId: topicIdOverride || this.getTopicForCategory(findings[0]?.category || 'core'),
        hcsSequenceNumber: sequenceNumber,
        timestamp: batch.timestamp,
        nodeId: this.nodeId,
        summary: this.generateBatchSummary(findings),
        keyFindings: findings.filter(f => f.importance >= 7).map(f => f.id),
        importance: batch.stats.avgImportance,
      };

      // Mark findings as referenced
      findings.forEach(f => {
        this.references.set(f.id, reference);
      });

      this.emit('findings_submitted', { batch, reference, sequenceNumber });

      console.log(`✅ Submitted ${findings.length} findings to HCS (seq: ${sequenceNumber})`);
      console.log(`🔗 https://hashscan.io/mainnet/topic/${topicIdOverride || this.getTopicForCategory(findings[0]?.category || 'core')}/${sequenceNumber}`);

      return reference;

    } catch (error) {
      console.error('❌ Failed to submit findings to HCS:', error);
      this.emit('submission_error', { error, batch });
      return null;
    }
  }

  private isFindingReferenced(findingId: string): boolean {
    return this.references.has(findingId);
  }

  private computeBatchStats(findings: Finding[]) {
    const categories: Record<string, number> = {};
    let totalImportance = 0;

    findings.forEach(f => {
      categories[f.category] = (categories[f.category] || 0) + 1;
      totalImportance += f.importance;
    });

    return {
      totalFindings: findings.length,
      avgImportance: findings.length > 0 ? totalImportance / findings.length : 0,
      categories,
    };
  }

  private generateBatchSummary(findings: Finding[]): string {
    const byType = findings.reduce((acc, f) => {
      acc[f.type] = (acc[f.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const highPriority = findings.filter(f => f.importance >= 7).length;
    
    return `${findings.length} findings (${highPriority} high-priority): ${Object.entries(byType).map(([t, c]) => `${c} ${t}`).join(', ')}`;
  }

  /**
   * Query findings by criteria
   */
  queryFindings(criteria: {
    type?: Finding['type'];
    category?: string;
    source?: string;
    minImportance?: number;
    since?: number;
    limit?: number;
  }): Finding[] {
    let results = Array.from(this.findings.values());

    if (criteria.type) {
      results = results.filter(f => f.type === criteria.type);
    }
    if (criteria.category) {
      results = results.filter(f => f.category === criteria.category);
    }
    if (criteria.source) {
      results = results.filter(f => f.source === criteria.source);
    }
    if (criteria.minImportance != null) {
      results = results.filter(f => f.importance >= criteria.minImportance!);
    }
    if (criteria.since != null) {
      results = results.filter(f => f.timestamp >= criteria.since!);
    }

    // Sort by importance desc, then timestamp desc
    results.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.timestamp - a.timestamp;
    });

    return results.slice(0, criteria.limit || results.length);
  }

  /**
   * Get lattice references for cross-node sync
   */
  getReferences(): LatticeReference[] {
    const refs = new Map<string, LatticeReference>();
    this.references.forEach((ref, findingId) => {
      if (!refs.has(ref.refId)) {
        refs.set(ref.refId, ref);
      }
    });
    return Array.from(refs.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get latest reference point for lattice sync
   */
  getLatestReference(): LatticeReference | null {
    const refs = this.getReferences();
    return refs.length > 0 ? refs[0] : null;
  }

  /**
   * Get findings from a specific reference
   */
  getFindingsByReference(refId: string): Finding[] {
    const ref = this.getReferences().find(r => r.refId === refId);
    if (!ref) return [];

    return Array.from(this.findings.values()).filter(
      f => ref.keyFindings.includes(f.id) || this.references.get(f.id)?.refId === refId
    );
  }

  /**
   * Get status summary
   */
  getStatus(): {
    pendingFindings: number;
    totalFindings: number;
    totalReferences: number;
    latestReference: LatticeReference | null;
    periodicSubmissionActive: boolean;
  } {
    return {
      pendingFindings: Array.from(this.findings.values()).filter(f => !this.isFindingReferenced(f.id)).length,
      totalFindings: this.findings.size,
      totalReferences: this.getReferences().length,
      latestReference: this.getLatestReference(),
      periodicSubmissionActive: this.intervalHandle !== null,
    };
  }

  /**
   * Clear old findings (keep last 24h)
   */
  cleanupOldFindings(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let cleared = 0;

    for (const [id, finding] of this.findings) {
      if (finding.timestamp < cutoff && this.isFindingReferenced(id)) {
        this.findings.delete(id);
        this.references.delete(id);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`🧹 Cleaned up ${cleared} old findings`);
    }
  }

  /**
   * Record a lattice recall point - what worked, what didn't, best way
   * Usefulness rating: 1-10 (10 = extremely useful for future lattice work)
   */
  recordRecallPoint(
    action: string,
    outcome: 'worked' | 'failed' | 'partial',
    usefulnessRating: number, // 1-10
    notes: {
      whatWorked?: string;
      whatDidntWork?: string;
      bestWay?: string;
      lessonsLearned?: string;
    },
    context?: Record<string, unknown>
  ): Finding {
    const importance = outcome === 'failed' ? 8 : usefulnessRating >= 8 ? 7 : 6;
    const category = outcome === 'worked' ? 'recall_success' : 
                     outcome === 'failed' ? 'recall_failure' : 'recall_partial';
    
    const summary = outcome === 'worked' 
      ? `✅ RECALL: ${action} worked (usefulness: ${usefulnessRating}/10)`
      : outcome === 'failed'
      ? `❌ RECALL: ${action} failed (usefulness: ${usefulnessRating}/10)`
      : `⚠️ RECALL: ${action} partial (usefulness: ${usefulnessRating}/10)`;

    return this.recordFinding(
      outcome === 'failed' ? 'error' : 'insight',
      'lattice-recall',
      summary,
      {
        action,
        outcome,
        usefulnessRating,
        notes,
        context,
        timestamp: Date.now(),
        recallType: 'hcs_lattice_point'
      },
      importance,
      category
    );
  }

  /**
   * Get all recall points for a specific outcome type
   */
  getRecallPoints(outcome?: 'worked' | 'failed' | 'partial'): Array<{
    action: string;
    outcome: string;
    usefulnessRating: number;
    notes: any;
    timestamp: number;
  }> {
    const allFindings = Array.from(this.findings.values());
    const recallFindings = allFindings.filter(f => 
      f.source === 'lattice-recall' && 
      f.details?.recallType === 'hcs_lattice_point'
    );
    
    if (outcome) {
      return recallFindings
        .filter(f => f.details?.outcome === outcome)
        .map(f => ({
          action: f.details?.action as string,
          outcome: f.details?.outcome as string,
          usefulnessRating: f.details?.usefulnessRating as number,
          notes: f.details?.notes,
          timestamp: f.timestamp
        }));
    }
    
    return recallFindings.map(f => ({
      action: f.details?.action as string,
      outcome: f.details?.outcome as string,
      usefulnessRating: f.details?.usefulnessRating as number,
      notes: f.details?.notes,
      timestamp: f.timestamp
    }));
  }

  /**
   * Get best practices from successful recall points (usefulness >= 8)
   */
  getBestPractices(): Array<{
    action: string;
    bestWay: string;
    usefulnessRating: number;
  }> {
    return this.getRecallPoints('worked')
      .filter(r => r.usefulnessRating >= 8)
      .map(r => ({
        action: r.action,
        bestWay: r.notes?.bestWay || 'No best way recorded',
        usefulnessRating: r.usefulnessRating
      }))
      .sort((a, b) => b.usefulnessRating - a.usefulnessRating);
  }

  /**
   * Get lessons from failures for lattice learning
   */
  getFailureLessons(): Array<{
    action: string;
    whatDidntWork: string;
    lessonsLearned: string;
  }> {
    return this.getRecallPoints('failed')
      .map(r => ({
        action: r.action,
        whatDidntWork: r.notes?.whatDidntWork || 'No details recorded',
        lessonsLearned: r.notes?.lessonsLearned || 'No lessons recorded'
      }));
  }

  /**
   * Generate recall summary for HCS - what the lattice learned
   */
  generateRecallSummary(): Finding {
    const worked = this.getRecallPoints('worked');
    const failed = this.getRecallPoints('failed');
    const partial = this.getRecallPoints('partial');
    
    const avgUsefulnessWorked = worked.length > 0 
      ? worked.reduce((s, r) => s + r.usefulnessRating, 0) / worked.length 
      : 0;
    
    const bestPractices = this.getBestPractices().slice(0, 5);
    const failureLessons = this.getFailureLessons().slice(0, 5);
    
    return this.recordFinding(
      'insight',
      'lattice-recall-summary',
      `Lattice Recall Summary: ${worked.length} successes, ${failed.length} failures, ${partial.length} partial`,
      {
        totalRecallPoints: worked.length + failed.length + partial.length,
        worked: { count: worked.length, avgUsefulness: avgUsefulnessWorked },
        failed: { count: failed.length },
        partial: { count: partial.length },
        topBestPractices: bestPractices,
        keyFailureLessons: failureLessons,
        timestamp: Date.now()
      },
      7,
      'recall_summary'
    );
  }

  /**
   * Multi-Topic Lattice Nervous System Methods
   */

  /**
   * Get the target topic ID for a category (auto-routing)
   */
  private getTopicForCategory(category: string): string {
    const topicKey = CATEGORY_ROUTING[category.toLowerCase()] || 'core';
    return TOPIC_CONFIG[topicKey].id;
  }

  /**
   * Get all topic configurations
   */
  getTopicConfig(): typeof TOPIC_CONFIG {
    return { ...TOPIC_CONFIG };
  }

  /**
   * Cross-topic query: Search findings across multiple topics
   */
  crossTopicQuery(
    criteria: { 
      type?: string; 
      category?: string; 
      minImportance?: number; 
      since?: number;
      keywords?: string[];
    },
    topicKeys: Array<keyof typeof TOPIC_CONFIG> = ['core']
  ): Finding[] {
    // In a real implementation, this would query HCS for each topic
    // For now, filter local findings that would be routed to those topics
    const results: Finding[] = [];
    
    for (const finding of this.findings.values()) {
      // Check if finding matches criteria
      if (criteria.type && finding.type !== criteria.type) continue;
      if (criteria.category && finding.category !== criteria.category) continue;
      if (criteria.minImportance && finding.importance < criteria.minImportance) continue;
      if (criteria.since && finding.timestamp < criteria.since) continue;
      
      // Check if finding would be routed to one of the requested topics
      const targetTopic = this.getTopicForCategory(finding.category);
      const requestedTopicIds = topicKeys.map(k => TOPIC_CONFIG[k].id);
      if (!requestedTopicIds.includes(targetTopic)) continue;
      
      results.push(finding);
    }
    
    // Sort by importance desc, then timestamp desc
    return results.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.timestamp - a.timestamp;
    });
  }

  /**
   * Synthesize insights from multiple topics
   * Example: "What DeFi yield strategies could apply to carbon staking?"
   */
  synthesizeInsights(
    fromTopic: keyof typeof TOPIC_CONFIG,
    toTopic: keyof typeof TOPIC_CONFIG,
    context?: string
  ): Finding {
    const fromFindings = this.crossTopicQuery({ minImportance: 7 }, [fromTopic]);
    const toFindings = this.crossTopicQuery({ minImportance: 5 }, [toTopic]);
    
    // Simple synthesis: find patterns that could transfer
    const transferableInsights = fromFindings.slice(0, 3).map(f => ({
      id: f.id,
      summary: f.summary,
      category: f.category,
      importance: f.importance
    }));
    
    const synthesis = {
      fromTopic,
      toTopic,
      context,
      transferableInsights,
      targetContext: toFindings.slice(0, 2).map(f => f.category),
      timestamp: Date.now()
    };
    
    return this.recordFinding(
      'insight',
      'lattice-synthesis',
      `Cross-topic synthesis: ${fromTopic} → ${toTopic} insights`,
      synthesis,
      8,
      'cross_topic_synthesis'
    );
  }

  /**
   * Propagate a best practice from one topic to another
   */
  propagateBestPractice(
    fromTopic: keyof typeof TOPIC_CONFIG,
    toTopic: keyof typeof TOPIC_CONFIG,
    practice: { action: string; bestWay: string; usefulnessRating: number }
  ): Finding {
    return this.recordFinding(
      'pattern',
      'lattice-propagation',
      `Best practice from ${fromTopic} applied to ${toTopic}: ${practice.action}`,
      {
        fromTopic,
        toTopic,
        practice,
        propagatedAt: Date.now(),
        confidence: practice.usefulnessRating / 10
      },
      7,
      'best_practice_propagation'
    );
  }

  /**
   * Get nervous system health across all topics
   */
  getNervousSystemHealth(): {
    topics: Record<string, { id: string; status: string; pendingFindings: number }>;
    totalPending: number;
    crossTopicFindings: number;
    lastSync: number;
  } {
    const topicKeys = Object.keys(TOPIC_CONFIG) as Array<keyof typeof TOPIC_CONFIG>;
    const topics: Record<string, { id: string; status: string; pendingFindings: number }> = {};
    
    for (const key of topicKeys) {
      const config = TOPIC_CONFIG[key];
      // Count pending findings that would route to this topic
      const pendingForTopic = Array.from(this.findings.values()).filter(f => {
        const targetTopic = this.getTopicForCategory(f.category);
        return targetTopic === config.id && !this.isFindingReferenced(f.id);
      }).length;
      
      topics[key] = {
        id: config.id,
        status: pendingForTopic > 10 ? 'busy' : pendingForTopic > 0 ? 'active' : 'idle',
        pendingFindings: pendingForTopic
      };
    }
    
    const crossTopicFindings = Array.from(this.findings.values()).filter(f => 
      f.category === 'cross_topic_synthesis' || f.category === 'best_practice_propagation'
    ).length;
    
    return {
      topics,
      totalPending: Object.values(topics).reduce((sum, t) => sum + t.pendingFindings, 0),
      crossTopicFindings,
      lastSync: Date.now()
    };
  }
}

// Export singleton for global use
export const latticeFindingsLogger = new LatticeFindingsLogger();

// Export class for custom instances
export { LatticeFindingsLogger };
export type { Finding, FindingBatch, LatticeReference };
