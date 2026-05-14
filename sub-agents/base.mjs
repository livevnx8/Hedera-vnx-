/**
 * Vera Sub-Agent Base Class
 * Modular specialized agents that work under parent agents
 */

export class SubAgent {
  constructor(config) {
    this.id = config.id;
    this.parentId = config.parentId;
    this.role = config.role;
    this.interval = config.interval || 60000; // Default 1 minute
    this.state = 'IDLE';
    this.lastRun = 0;
    this.runCount = 0;
    this.errors = [];
    this.metrics = {
      executionsTotal: 0,
      errorsTotal: 0,
      avgExecutionTimeMs: 0,
      lastExecutionTimeMs: 0
    };
  }

  /**
   * Execute the sub-agent task
   */
  async execute(parentContext = {}) {
    const startTime = Date.now();
    this.state = 'RUNNING';
    this.lastRun = Date.now();
    
    try {
      const result = await this.performTask(parentContext);
      this.state = 'IDLE';
      this.runCount++;
      this.metrics.executionsTotal++;
      
      // Update execution time metrics
      const executionTime = Date.now() - startTime;
      this.metrics.lastExecutionTimeMs = executionTime;
      this.metrics.avgExecutionTimeMs = 
        (this.metrics.avgExecutionTimeMs * (this.metrics.executionsTotal - 1) + executionTime) 
        / this.metrics.executionsTotal;
      
      return {
        success: true,
        result,
        executionTimeMs: executionTime,
        subAgentId: this.id
      };
    } catch (error) {
      this.state = 'ERROR';
      this.metrics.errorsTotal++;
      this.errors.push({
        message: error.message,
        timestamp: Date.now(),
        runCount: this.runCount
      });
      
      // Keep only last 10 errors
      if (this.errors.length > 10) {
        this.errors.shift();
      }
      
      return {
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime,
        subAgentId: this.id
      };
    }
  }

  /**
   * Override this method in subclasses
   */
  async performTask(parentContext) {
    throw new Error('performTask() must be implemented by subclass');
  }

  /**
   * Get sub-agent statistics
   */
  getStats() {
    return {
      id: this.id,
      parentId: this.parentId,
      role: this.role,
      state: this.state,
      runCount: this.runCount,
      lastRun: this.lastRun,
      interval: this.interval,
      errorCount: this.errors.length,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Reset sub-agent state
   */
  reset() {
    this.state = 'IDLE';
    this.errors = [];
    this.runCount = 0;
    this.metrics = {
      executionsTotal: 0,
      errorsTotal: 0,
      avgExecutionTimeMs: 0,
      lastExecutionTimeMs: 0
    };
  }

  /**
   * Check if sub-agent should run based on interval
   */
  shouldRun() {
    return Date.now() - this.lastRun >= this.interval;
  }

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics() {
    return `
# HELP vera_subagent_executions_total Total executions
# TYPE vera_subagent_executions_total counter
vera_subagent_executions_total{subagent_id="${this.id}",role="${this.role}",parent_id="${this.parentId}"} ${this.metrics.executionsTotal}

# HELP vera_subagent_errors_total Total errors
# TYPE vera_subagent_errors_total counter
vera_subagent_errors_total{subagent_id="${this.id}",role="${this.role}",parent_id="${this.parentId}"} ${this.metrics.errorsTotal}

# HELP vera_subagent_execution_time_ms Average execution time
# TYPE vera_subagent_execution_time_ms gauge
vera_subagent_execution_time_ms{subagent_id="${this.id}",role="${this.role}",parent_id="${this.parentId}"} ${this.metrics.avgExecutionTimeMs.toFixed(2)}

# HELP vera_subagent_state Current state (1=IDLE, 2=RUNNING, 0=ERROR)
# TYPE vera_subagent_state gauge
vera_subagent_state{subagent_id="${this.id}",role="${this.role}",parent_id="${this.parentId}"} ${this.state === 'IDLE' ? 1 : this.state === 'RUNNING' ? 2 : 0}
`.trim();
  }
}

export default SubAgent;
