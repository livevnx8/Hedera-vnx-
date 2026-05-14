/**
 * Circuit Breaker Pattern for Meridian HTTP Clients
 * 
 * Prevents cascade failures by opening circuit after threshold failures
 * Automatically attempts recovery after cooldown period
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening circuit
  resetTimeoutMs: number;        // Time before attempting recovery
  halfOpenMaxCalls: number;      // Test calls in half-open state
  successThreshold: number;      // Successes required to close circuit
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalCalls: number;
  rejectedCalls: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30000,  // 30 seconds
  halfOpenMaxCalls: 3,
  successThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private stats: CircuitBreakerStats = {
    state: 'closed',
    failures: 0,
    successes: 0,
    lastFailureTime: null,
    lastSuccessTime: null,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    totalCalls: 0,
    rejectedCalls: 0,
  };
  private halfOpenCalls = 0;
  private nextAttempt = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CONFIG,
  ) {}

  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return { ...this.stats, state: this.state };
  }

  canExecute(): boolean {
    this.updateState();

    if (this.state === 'open') {
      this.stats.rejectedCalls++;
      return false;
    }

    if (this.state === 'half-open' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      this.stats.rejectedCalls++;
      return false;
    }

    return true;
  }

  recordSuccess(): void {
    const now = Date.now();
    this.stats.successes++;
    this.stats.consecutiveSuccesses++;
    this.stats.consecutiveFailures = 0;
    this.stats.lastSuccessTime = now;
    this.stats.totalCalls++;

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
      
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.closeCircuit();
      }
    }
  }

  recordFailure(error?: Error): void {
    const now = Date.now();
    this.stats.failures++;
    this.stats.consecutiveFailures++;
    this.stats.consecutiveSuccesses = 0;
    this.stats.lastFailureTime = now;
    this.stats.totalCalls++;

    if (this.state === 'half-open') {
      this.openCircuit();
      return;
    }

    if (this.state === 'closed' && this.stats.consecutiveFailures >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  private updateState(): void {
    const now = Date.now();

    if (this.state === 'open' && now >= this.nextAttempt) {
      this.state = 'half-open';
      this.halfOpenCalls = 0;
      console.log(`[CircuitBreaker:${this.name}] Entering half-open state - testing recovery`);
    }
  }

  private openCircuit(): void {
    this.state = 'open';
    this.nextAttempt = Date.now() + this.config.resetTimeoutMs;
    this.halfOpenCalls = 0;
    console.log(`[CircuitBreaker:${this.name}] Circuit OPENED - cooling down for ${this.config.resetTimeoutMs}ms`);
  }

  private closeCircuit(): void {
    this.state = 'closed';
    this.stats.consecutiveFailures = 0;
    this.halfOpenCalls = 0;
    console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED - healthy`);
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (!this.canExecute()) {
      if (fallback) {
        console.log(`[CircuitBreaker:${this.name}] Circuit open, using fallback`);
        return fallback();
      }
      throw new Error(`Circuit breaker ${this.name} is open`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

// Circuit breaker registry for managing multiple breakers
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  getStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  healthCheck(): { healthy: boolean; details: Record<string, CircuitState> } {
    const details: Record<string, CircuitState> = {};
    let healthy = true;

    for (const [name, breaker] of this.breakers) {
      const state = breaker.getState();
      details[name] = state;
      if (state === 'open') healthy = false;
    }

    return { healthy, details };
  }
}

export const globalCircuitBreakers = new CircuitBreakerRegistry();
