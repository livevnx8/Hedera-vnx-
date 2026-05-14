/**
 * Vera Enterprise Metrics (Simplified - no external dependencies)
 * 
 * Prometheus-compatible metrics collection without requiring prom-client.
 * Uses native Node.js for minimal footprint.
 */

interface MetricValue {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

interface HistogramBucket {
  bucket: number;
  count: number;
}

class Counter {
  private values: MetricValue[] = [];
  private name: string;
  private help: string;
  private labelNames: string[];

  constructor(config: { name: string; help: string; labelNames?: string[] }) {
    this.name = config.name;
    this.help = config.help;
    this.labelNames = config.labelNames || [];
  }

  inc(labels?: Record<string, string>, value = 1): void {
    this.values.push({
      value,
      labels: labels || {},
      timestamp: Date.now()
    });
  }

  get(): number {
    return this.values.reduce((sum, v) => sum + v.value, 0);
  }
}

class Histogram {
  private buckets: HistogramBucket[];
  private values: number[] = [];
  private name: string;
  private help: string;

  constructor(config: { 
    name: string; 
    help: string;
    buckets: number[];
  }) {
    this.name = config.name;
    this.help = config.help;
    this.buckets = config.buckets.map(b => ({ bucket: b, count: 0 }));
  }

  observe(value: number): void {
    this.values.push(value);
    for (const bucket of this.buckets) {
      if (value <= bucket.bucket) {
        bucket.count++;
      }
    }
  }
}

export class VeraMetrics {
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.counters.set('vera_agents_executions', new Counter({
      name: 'vera_agent_executions_total',
      help: 'Total agent task executions',
      labelNames: ['agent_id', 'task_type', 'status']
    }));

    this.histograms.set('vera_agent_latency', new Histogram({
      name: 'vera_agent_execution_duration_seconds',
      help: 'Agent execution latency in seconds',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    }));

    this.counters.set('vera_hcs_messages', new Counter({
      name: 'vera_hcs_messages_total',
      help: 'Total HCS messages',
      labelNames: ['topic_id', 'status']
    }));

    this.counters.set('vera_falcon_handshakes', new Counter({
      name: 'vera_falcon_handshakes_total',
      help: 'Total Falcon handshakes',
      labelNames: ['status']
    }));

    this.histograms.set('vera_falcon_latency', new Histogram({
      name: 'vera_falcon_handshake_duration_milliseconds',
      help: 'Falcon handshake latency',
      buckets: [1, 2, 3, 5, 7, 10, 20, 50]
    }));

    this.counters.set('vera_api_calls', new Counter({
      name: 'vera_api_calls_total',
      help: 'Total API calls',
      labelNames: ['endpoint', 'status']
    }));
  }

  recordAgentExecution(agentId: string, taskType: string, durationMs: number, success: boolean): void {
    const status = success ? 'success' : 'failure';
    this.counters.get('vera_agents_executions')?.inc({ agent_id: agentId, task_type: taskType, status });
    this.histograms.get('vera_agent_latency')?.observe(durationMs / 1000);
  }

  recordHCSSubmission(topicId: string, success: boolean): void {
    const status = success ? 'success' : 'failure';
    this.counters.get('vera_hcs_messages')?.inc({ topic_id: topicId, status });
  }

  recordFalconHandshake(durationMs: number, success: boolean): void {
    const status = success ? 'success' : 'failure';
    this.counters.get('vera_falcon_handshakes')?.inc({ status });
    this.histograms.get('vera_falcon_latency')?.observe(durationMs);
  }

  recordAPICall(endpoint: string, statusCode: number): void {
    const status = statusCode >= 200 && statusCode < 300 ? 'success' : 'error';
    this.counters.get('vera_api_calls')?.inc({ endpoint, status });
  }
}

let metricsInstance: VeraMetrics | null = null;

export function getVeraMetrics(): VeraMetrics {
  if (!metricsInstance) {
    metricsInstance = new VeraMetrics();
  }
  return metricsInstance;
}
