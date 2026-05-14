/**
 * Vera Agent Learning Infrastructure - Phase 4 Implementation
 * Analytics, skill tracking, and continuous improvement system
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';

export interface ToolUsageRecord {
  id: string;
  toolName: string;
  agentId: string;
  workflowId?: string;
  input: string;
  output: string;
  success: boolean;
  error?: string;
  durationMs: number;
  timestamp: number;
  hbarCost?: number;
}

export interface SkillNode {
  tool: string;
  frequency: number;
  avgSuccessRate: number;
  avgDuration: number;
  relatedTools: string[];
  commonSequences: string[][];
}

export interface AgentPerformanceMetrics {
  agentId: string;
  totalCalls: number;
  successRate: number;
  avgLatency: number;
  topTools: string[];
  improvementAreas: string[];
  learningProgress: number;
}

export interface LearningRecommendation {
  type: 'new_tool' | 'workflow_optimization' | 'skill_gap' | 'best_practice';
  priority: 'low' | 'medium' | 'high';
  description: string;
  action: string;
  expectedImpact: string;
}

class AgentLearningSystem extends EventEmitter {
  private db: Database.Database;
  private toolUsageCache: ToolUsageRecord[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(dbPath: string = './data/agent-learning.db') {
    super();
    this.db = new Database(dbPath);
    this.initializeDatabase();
    this.startFlushInterval();
  }

  private initializeDatabase(): void {
    // Tool usage table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_usage (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workflow_id TEXT,
        input TEXT,
        output TEXT,
        success INTEGER NOT NULL,
        error TEXT,
        duration_ms INTEGER,
        timestamp INTEGER NOT NULL,
        hbar_cost REAL
      );
      CREATE INDEX IF NOT EXISTS idx_tool_usage_agent ON tool_usage(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_time ON tool_usage(timestamp);
    `);

    // Skill graph table - tracks tool combinations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        sequence TEXT NOT NULL, -- JSON array of tools
        frequency INTEGER DEFAULT 1,
        avg_success_rate REAL,
        last_used INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sequences_agent ON skill_sequences(agent_id);
    `);

    // Agent learning state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_learning (
        agent_id TEXT PRIMARY KEY,
        total_calls INTEGER DEFAULT 0,
        successful_calls INTEGER DEFAULT 0,
        avg_latency REAL DEFAULT 0,
        skill_level REAL DEFAULT 0,
        last_training INTEGER,
        learning_data TEXT -- JSON
      );
    `);

    console.log('🧠 Agent Learning System initialized');
  }

  /**
   * Record a tool usage event
   */
  recordToolUsage(record: Omit<ToolUsageRecord, 'id'>): void {
    const fullRecord: ToolUsageRecord = {
      ...record,
      id: `${record.agentId}-${record.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
    };

    this.toolUsageCache.push(fullRecord);
    this.emit('tool_usage_recorded', { tool: record.toolName, agent: record.agentId });

    // Flush if cache is large
    if (this.toolUsageCache.length >= 100) {
      this.flushCache();
    }
  }

  /**
   * Flush cached tool usage to database
   */
  private flushCache(): void {
    if (this.toolUsageCache.length === 0) return;

    const insert = this.db.prepare(`
      INSERT INTO tool_usage (id, tool_name, agent_id, workflow_id, input, output, 
        success, error, duration_ms, timestamp, hbar_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((records: ToolUsageRecord[]) => {
      for (const record of records) {
        insert.run(
          record.id,
          record.toolName,
          record.agentId,
          record.workflowId || null,
          JSON.stringify(record.input),
          record.output,
          record.success ? 1 : 0,
          record.error || null,
          record.durationMs,
          record.timestamp,
          record.hbarCost || null
        );
      }
    });

    transaction(this.toolUsageCache);
    console.log(`💾 Flushed ${this.toolUsageCache.length} tool usage records`);
    this.toolUsageCache = [];
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flushCache();
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Get tool usage analytics for an agent
   */
  getToolAnalytics(agentId: string, days: number = 7): any {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);

    const stats = this.db.prepare(`
      SELECT 
        tool_name,
        COUNT(*) as calls,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(duration_ms) as avg_duration,
        AVG(hbar_cost) as avg_cost
      FROM tool_usage
      WHERE agent_id = ? AND timestamp > ?
      GROUP BY tool_name
      ORDER BY calls DESC
    `).all(agentId, since);

    return {
      agentId,
      period: `${days} days`,
      tools: stats.map((s: any) => {
        const calls = Number(s.calls) || 0;
        const successes = Number(s.successes) || 0;
        const avgDuration = Number(s.avg_duration) || 0;
        const avgCost = Number(s.avg_cost) || 0;
        const successRate = calls > 0 ? successes / calls : 0;
        return {
          tool: s.tool_name,
          calls,
          successRate,              // numeric 0..1
          avgDuration,              // numeric ms
          avgCost,                  // numeric HBAR
          // Human-readable versions for UIs
          successRateLabel: `${(successRate * 100).toFixed(1)}%`,
          avgDurationLabel: `${Math.round(avgDuration)}ms`,
          avgCostLabel: `${avgCost.toFixed(6)} HBAR`,
        };
      }),
    };
  }

  /**
   * Get performance metrics for all agents
   */
  getAllAgentMetrics(): AgentPerformanceMetrics[] {
    const metrics = this.db.prepare(`
      SELECT 
        agent_id,
        COUNT(*) as total_calls,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
        AVG(duration_ms) as avg_latency
      FROM tool_usage
      WHERE timestamp > ?
      GROUP BY agent_id
    `).all(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return metrics.map((m: any) => ({
      agentId: m.agent_id,
      totalCalls: m.total_calls,
      successRate: m.total_calls > 0 ? (m.successful_calls / m.total_calls) : 0,
      avgLatency: m.avg_latency || 0,
      topTools: this.getTopToolsForAgent(m.agent_id, 5),
      improvementAreas: this.identifyImprovementAreas(m.agent_id),
      learningProgress: this.calculateLearningProgress(m.agent_id),
    }));
  }

  private getTopToolsForAgent(agentId: string, limit: number): string[] {
    const tools = this.db.prepare(`
      SELECT tool_name, COUNT(*) as calls
      FROM tool_usage
      WHERE agent_id = ? AND timestamp > ?
      GROUP BY tool_name
      ORDER BY calls DESC
      LIMIT ?
    `).all(agentId, Date.now() - 7 * 24 * 60 * 60 * 1000, limit);

    return tools.map((t: any) => t.tool_name);
  }

  private identifyImprovementAreas(agentId: string): string[] {
    const areas: string[] = [];

    // Find tools with low success rates
    const poorTools = this.db.prepare(`
      SELECT tool_name,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as rate
      FROM tool_usage
      WHERE agent_id = ? AND timestamp > ?
      GROUP BY tool_name
      HAVING rate < 0.8
    `).all(agentId, Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (poorTools.length > 0) {
      areas.push(`Low success rate on: ${poorTools.map((t: any) => t.tool_name).join(', ')}`);
    }

    // Find slow tools
    const slowTools = this.db.prepare(`
      SELECT tool_name, AVG(duration_ms) as avg_time
      FROM tool_usage
      WHERE agent_id = ? AND timestamp > ?
      GROUP BY tool_name
      HAVING avg_time > 5000
    `).all(agentId, Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (slowTools.length > 0) {
      areas.push(`Performance issues on: ${slowTools.map((t: any) => t.tool_name).join(', ')}`);
    }

    return areas;
  }

  private calculateLearningProgress(agentId: string): number {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT tool_name) as tools_used,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
      FROM tool_usage
      WHERE agent_id = ?
    `).get(agentId) as { tools_used: number; success_rate: number } | undefined;

    if (!stats) return 0;

    // Simple formula: (tools mastered * success rate) / target
    const toolsScore = Math.min(stats.tools_used / 20, 1); // Max at 20 tools
    const successScore = stats.success_rate || 0;

    return Math.round((toolsScore * 0.4 + successScore * 0.6) * 100);
  }

  /**
   * Record a tool sequence (for learning workflow patterns)
   */
  recordToolSequence(agentId: string, tools: string[]): void {
    const sequence = JSON.stringify(tools);
    
    const existing = this.db.prepare(`
      SELECT id, frequency FROM skill_sequences 
      WHERE agent_id = ? AND sequence = ?
    `).get(agentId, sequence) as { id: number; frequency: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE skill_sequences 
        SET frequency = frequency + 1, last_used = ?
        WHERE id = ?
      `).run(Date.now(), existing.id);
    } else {
      this.db.prepare(`
        INSERT INTO skill_sequences (agent_id, sequence, frequency, last_used)
        VALUES (?, ?, 1, ?)
      `).run(agentId, sequence, Date.now());
    }
  }

  /**
   * Get learning recommendations for an agent
   */
  getRecommendations(agentId: string): LearningRecommendation[] {
    const recommendations: LearningRecommendation[] = [];

    // Check for underutilized tools
    const allTools = this.db.prepare(`
      SELECT DISTINCT tool_name FROM tool_usage WHERE agent_id = ?
    `).all(agentId).map((r: any) => r.tool_name);

    const commonTools = ['hts_create_token', 'hbar_transfer', 'hcs_submit_message'];
    const missingTools = commonTools.filter(t => !allTools.includes(t));

    if (missingTools.length > 0) {
      recommendations.push({
        type: 'new_tool',
        priority: 'medium',
        description: `Agent hasn't used: ${missingTools.join(', ')}`,
        action: 'Practice with these tools in test scenarios',
        expectedImpact: 'Expand capability coverage',
      });
    }

    // Find frequently used sequences that could become workflows
    const sequences = this.db.prepare(`
      SELECT sequence, frequency
      FROM skill_sequences
      WHERE agent_id = ? AND frequency > 3
      ORDER BY frequency DESC
      LIMIT 5
    `).all(agentId);

    for (const seq of sequences as { sequence: string; frequency: number }[]) {
      const tools = JSON.parse(seq.sequence);
      if (tools.length >= 3) {
        recommendations.push({
          type: 'workflow_optimization',
          priority: 'high',
          description: `Frequent sequence detected: ${tools.join(' → ')}`,
          action: 'Create a workflow for this pattern',
          expectedImpact: 'Reduce execution time by 30-50%',
        });
      }
    }

    // Check for skill gaps
    const lowSuccessTools = this.db.prepare(`
      SELECT tool_name,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as rate
      FROM tool_usage
      WHERE agent_id = ?
      GROUP BY tool_name
      HAVING rate < 0.7
      ORDER BY rate ASC
    `).all(agentId);

    for (const tool of lowSuccessTools as { tool_name: string; rate: number }[]) {
      recommendations.push({
        type: 'skill_gap',
        priority: 'high',
        description: `${tool.tool_name} has ${(tool.rate * 100).toFixed(0)}% success rate`,
        action: 'Review error patterns and improve error handling',
        expectedImpact: 'Improve reliability',
      });
    }

    return recommendations;
  }

  /**
   * Build skill graph for visualization
   */
  buildSkillGraph(agentId: string): SkillNode[] {
    const tools = this.db.prepare(`
      SELECT tool_name,
        COUNT(*) as frequency,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate,
        AVG(duration_ms) as avg_duration
      FROM tool_usage
      WHERE agent_id = ?
      GROUP BY tool_name
    `).all(agentId);

    // Get sequences for related tools
    const sequences = this.db.prepare(`
      SELECT sequence, frequency
      FROM skill_sequences
      WHERE agent_id = ?
    `).all(agentId);

    return tools.map((t: any) => {
      const related = new Set<string>();
      const commonSeqs: string[][] = [];

      for (const seq of sequences as { sequence: string; frequency: number }[]) {
        const tools = JSON.parse(seq.sequence);
        if (tools.includes(t.tool_name)) {
          tools.forEach((tool: string) => {
            if (tool !== t.tool_name) related.add(tool);
          });
          commonSeqs.push(tools);
        }
      }

      return {
        tool: t.tool_name,
        frequency: t.frequency,
        avgSuccessRate: t.success_rate,
        avgDuration: t.avg_duration,
        relatedTools: Array.from(related),
        commonSequences: commonSeqs.slice(0, 5),
      };
    });
  }

  /**
   * Generate learning report
   */
  generateReport(agentId?: string): string {
    const sections: string[] = [];
    
    sections.push('# Agent Learning Report\n');
    sections.push(`Generated: ${new Date().toISOString()}\n`);

    if (agentId) {
      // Single agent report
      const metrics = this.getAllAgentMetrics().find(m => m.agentId === agentId);
      if (metrics) {
        sections.push(`## Agent: ${agentId}\n`);
        sections.push(`- Total Calls: ${metrics.totalCalls}`);
        sections.push(`- Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
        sections.push(`- Avg Latency: ${metrics.avgLatency.toFixed(0)}ms`);
        sections.push(`- Learning Progress: ${metrics.learningProgress}%\n`);

        const analytics = this.getToolAnalytics(agentId, 7);
        sections.push('### Top Tools:\n');
        for (const tool of analytics.tools.slice(0, 5)) {
          sections.push(`- ${tool.tool}: ${tool.calls} calls, ${tool.successRate} success`);
        }
        sections.push('');

        const recommendations = this.getRecommendations(agentId);
        if (recommendations.length > 0) {
          sections.push('### Recommendations:\n');
          for (const rec of recommendations) {
            sections.push(`**${rec.type.toUpperCase()}** [${rec.priority}]`);
            sections.push(`- ${rec.description}`);
            sections.push(`- Action: ${rec.action}`);
            sections.push(`- Impact: ${rec.expectedImpact}\n`);
          }
        }
      }
    } else {
      // All agents report
      const allMetrics = this.getAllAgentMetrics();
      sections.push(`## All Agents Summary\n`);
      sections.push(`Total Agents: ${allMetrics.length}\n`);
      
      for (const m of allMetrics) {
        sections.push(`- ${m.agentId}: ${m.totalCalls} calls, ${(m.successRate * 100).toFixed(0)}% success, ${m.learningProgress}% learned`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.flushCache();
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.db.close();
    console.log('🧠 Agent Learning System closed');
  }
}

// Export singleton
export const agentLearningSystem = new AgentLearningSystem();

// Export class for custom instances
export { AgentLearningSystem };
