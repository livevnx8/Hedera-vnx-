/**
 * Prometheus Metrics for VeraLattice
 */

export class PrometheusMetrics {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  constructor() {
    // Initialize counters
    this.counters.set('http_requests_total', 0);
    this.counters.set('tool_executions_total', 0);
    this.counters.set('errors_total', 0);
    this.counters.set('wallet_operations_total', 0);

    // Vera orchestrator counters
    this.counters.set('vera_tasks_published_total', 0);
    this.counters.set('vera_bids_received_total', 0);
    this.counters.set('vera_tasks_awarded_total', 0);
    this.counters.set('vera_tasks_accepted_total', 0);
    this.counters.set('vera_tasks_rejected_total', 0);
    this.counters.set('vera_tasks_expired_total', 0);
    this.counters.set('vera_escrow_locked_total', 0);
    this.counters.set('vera_escrow_released_total', 0);
    this.counters.set('vera_escrow_reclaimed_total', 0);
    this.counters.set('vera_settlements_total', 0);
    this.counters.set('vera_settlements_failed_total', 0);
    this.counters.set('vera_verifications_total', 0);

    // Chain engine counters
    this.counters.set('vera_chains_created_total', 0);
    this.counters.set('vera_chains_completed_total', 0);
    this.counters.set('vera_chains_failed_total', 0);
    this.counters.set('vera_chain_steps_dispatched_total', 0);
    this.counters.set('vera_chain_steps_completed_total', 0);
    this.counters.set('vera_chain_steps_failed_total', 0);
    this.counters.set('vera_chain_rollbacks_total', 0);

    // Negotiation counters
    this.counters.set('vera_negotiations_started_total', 0);
    this.counters.set('vera_negotiations_accepted_total', 0);
    this.counters.set('vera_negotiations_rejected_total', 0);
    this.counters.set('vera_negotiations_timed_out_total', 0);
    this.counters.set('vera_negotiations_fallback_total', 0);

    // Batch settlement counters
    this.counters.set('vera_batch_settlements_total', 0);
    this.counters.set('vera_batch_items_settled_total', 0);

    // Fiat on-ramp counters
    this.counters.set('vera_fiat_payments_initiated_total', 0);
    this.counters.set('vera_fiat_payments_completed_total', 0);
    this.counters.set('vera_fiat_payments_failed_total', 0);

    // Streaming payment counters
    this.counters.set('vera_streams_started_total', 0);
    this.counters.set('vera_streams_completed_total', 0);

    // Circuit breaker counters
    this.counters.set('vera_circuit_breaker_trips_total', 0);
    this.counters.set('vera_circuit_breaker_resets_total', 0);

    // HIP-1056 Block Stream counters
    this.counters.set('blockstream_blocks_received_total', 0);
    this.counters.set('blockstream_hcs_messages_extracted_total', 0);
    this.counters.set('blockstream_divergence_events_total', 0);
    this.counters.set('blockstream_reconnects_total', 0);
    this.counters.set('blockstream_errors_total', 0);

    // HMAC / security counters
    this.counters.set('vera_hmac_verified_total', 0);
    this.counters.set('vera_hmac_rejected_total', 0);
    this.counters.set('vera_sybil_blocked_total', 0);
    this.counters.set('vera_compliance_checks_total', 0);
    this.counters.set('vera_compliance_blocked_total', 0);

    // Initialize histograms
    this.histograms.set('http_request_duration_ms', []);
    this.histograms.set('tool_execution_duration_ms', []);
    this.histograms.set('wallet_operation_duration_ms', []);
    this.histograms.set('vera_bid_latency_ms', []);
    this.histograms.set('vera_settlement_duration_ms', []);
    this.histograms.set('vera_chain_duration_ms', []);
    this.histograms.set('vera_negotiation_rounds', []);
    this.histograms.set('vera_batch_size', []);
    this.histograms.set('blockstream_proof_verification_latency_ms', []);
    this.histograms.set('blockstream_grpc_read_latency_ms', []);

    // Initialize gauges
    this.gauges.set('active_sessions', 0);
    this.gauges.set('gpu_memory_usage', 0);
    this.gauges.set('vera_active_agents', 0);
    this.gauges.set('vera_locked_escrow_hbar', 0);
    this.gauges.set('vera_pending_tasks', 0);
    this.gauges.set('vera_in_progress_tasks', 0);
    this.gauges.set('vera_active_chains', 0);
    this.gauges.set('vera_active_negotiations', 0);
    this.gauges.set('vera_active_streams', 0);
    this.gauges.set('vera_batch_queue_size', 0);
    this.gauges.set('vera_hcs_shards', 0);
    this.gauges.set('vera_hcs_shard_throughput', 0);
    this.gauges.set('vera_circuit_breaker_state', 0); // 0=closed, 1=half-open, 2=open
    this.gauges.set('vera_total_settled_hbar', 0);
    this.gauges.set('vera_fiat_pending_amount', 0);
    // HIP-1056 block stream gauges
    this.gauges.set('blockstream_block_number', 0);
    this.gauges.set('blockstream_round_number', 0);
    this.gauges.set('blockstream_grpc_reconnect_count', 0);
  }

  recordRequest(endpoint: string, method: string, duration: number, success: boolean) {
    this.incrementCounter('http_requests_total');
    this.recordHistogram('http_request_duration_ms', duration);
    
    if (!success) {
      this.incrementCounter('errors_total');
    }
  }

  recordToolExecution(toolName: string, duration: number, success: boolean) {
    this.incrementCounter('tool_executions_total');
    this.recordHistogram('tool_execution_duration_ms', duration);
    
    if (!success) {
      this.incrementCounter('errors_total');
    }
  }

  recordError(errorType: string) {
    this.incrementCounter('errors_total');
  }

  recordWalletOperation(operation: string, duration: number, success: boolean) {
    this.incrementCounter('wallet_operations_total');
    this.recordHistogram('wallet_operation_duration_ms', duration);
    
    if (!success) {
      this.incrementCounter('errors_total');
    }
  }

  setActiveSessions(count: number) {
    this.setGauge('active_sessions', count);
  }

  setGPUMemoryUsage(usage: number) {
    this.setGauge('gpu_memory_usage', usage);
  }

  // ── Vera orchestrator metrics ──────────────────────────────────────────

  recordTaskPublished() { this.incrementCounter('vera_tasks_published_total'); }
  recordBidReceived() { this.incrementCounter('vera_bids_received_total'); }
  recordTaskAwarded() { this.incrementCounter('vera_tasks_awarded_total'); }
  recordTaskAccepted() { this.incrementCounter('vera_tasks_accepted_total'); }
  recordTaskRejected() { this.incrementCounter('vera_tasks_rejected_total'); }
  recordTaskExpired() { this.incrementCounter('vera_tasks_expired_total'); }
  recordEscrowLocked() { this.incrementCounter('vera_escrow_locked_total'); }
  recordEscrowReleased() { this.incrementCounter('vera_escrow_released_total'); }
  recordEscrowReclaimed() { this.incrementCounter('vera_escrow_reclaimed_total'); }
  recordSettlement(durationMs: number) {
    this.incrementCounter('vera_settlements_total');
    this.recordHistogram('vera_settlement_duration_ms', durationMs);
  }
  recordSettlementFailed() { this.incrementCounter('vera_settlements_failed_total'); }
  recordVerification() { this.incrementCounter('vera_verifications_total'); }
  recordBidLatency(latencyMs: number) { this.recordHistogram('vera_bid_latency_ms', latencyMs); }

  setActiveAgents(count: number) { this.setGauge('vera_active_agents', count); }
  setLockedEscrowHbar(amount: number) { this.setGauge('vera_locked_escrow_hbar', amount); }
  setPendingTasks(count: number) { this.setGauge('vera_pending_tasks', count); }
  setInProgressTasks(count: number) { this.setGauge('vera_in_progress_tasks', count); }

  // ── Chain engine metrics ──────────────────────────────────────────────
  recordChainCreated() { this.incrementCounter('vera_chains_created_total'); }
  recordChainCompleted(durationMs: number) {
    this.incrementCounter('vera_chains_completed_total');
    this.recordHistogram('vera_chain_duration_ms', durationMs);
  }
  recordChainFailed() { this.incrementCounter('vera_chains_failed_total'); }
  recordChainStepDispatched() { this.incrementCounter('vera_chain_steps_dispatched_total'); }
  recordChainStepCompleted() { this.incrementCounter('vera_chain_steps_completed_total'); }
  recordChainStepFailed() { this.incrementCounter('vera_chain_steps_failed_total'); }
  recordChainRollback() { this.incrementCounter('vera_chain_rollbacks_total'); }
  setActiveChains(count: number) { this.setGauge('vera_active_chains', count); }

  // ── Negotiation metrics ───────────────────────────────────────────────
  recordNegotiationStarted() { this.incrementCounter('vera_negotiations_started_total'); }
  recordNegotiationAccepted(rounds: number) {
    this.incrementCounter('vera_negotiations_accepted_total');
    this.recordHistogram('vera_negotiation_rounds', rounds);
  }
  recordNegotiationRejected() { this.incrementCounter('vera_negotiations_rejected_total'); }
  recordNegotiationTimedOut() { this.incrementCounter('vera_negotiations_timed_out_total'); }
  recordNegotiationFallback() { this.incrementCounter('vera_negotiations_fallback_total'); }
  setActiveNegotiations(count: number) { this.setGauge('vera_active_negotiations', count); }

  // ── Batch settlement metrics ──────────────────────────────────────────
  recordBatchSettled(batchSize: number) {
    this.incrementCounter('vera_batch_settlements_total');
    this.incrementCounterBy('vera_batch_items_settled_total', batchSize);
    this.recordHistogram('vera_batch_size', batchSize);
  }
  setBatchQueueSize(count: number) { this.setGauge('vera_batch_queue_size', count); }

  // ── Fiat on-ramp metrics ──────────────────────────────────────────────
  recordFiatInitiated() { this.incrementCounter('vera_fiat_payments_initiated_total'); }
  recordFiatCompleted() { this.incrementCounter('vera_fiat_payments_completed_total'); }
  recordFiatFailed() { this.incrementCounter('vera_fiat_payments_failed_total'); }
  setFiatPendingAmount(amount: number) { this.setGauge('vera_fiat_pending_amount', amount); }

  // ── Streaming payment metrics ─────────────────────────────────────────
  recordStreamStarted() { this.incrementCounter('vera_streams_started_total'); }
  recordStreamCompleted() { this.incrementCounter('vera_streams_completed_total'); }
  setActiveStreams(count: number) { this.setGauge('vera_active_streams', count); }

  // ── Circuit breaker metrics ───────────────────────────────────────────
  recordCircuitBreakerTrip() { this.incrementCounter('vera_circuit_breaker_trips_total'); }
  recordCircuitBreakerReset() { this.incrementCounter('vera_circuit_breaker_resets_total'); }
  setCircuitBreakerState(state: 'closed' | 'half_open' | 'open') {
    this.setGauge('vera_circuit_breaker_state', state === 'closed' ? 0 : state === 'half_open' ? 1 : 2);
  }

  // ── Sharding metrics ─────────────────────────────────────────────────
  setHcsShards(count: number) { this.setGauge('vera_hcs_shards', count); }
  setHcsShardThroughput(tps: number) { this.setGauge('vera_hcs_shard_throughput', tps); }

  // ── Security metrics ──────────────────────────────────────────────────
  recordHmacVerified() { this.incrementCounter('vera_hmac_verified_total'); }
  recordHmacRejected() { this.incrementCounter('vera_hmac_rejected_total'); }
  recordSybilBlocked() { this.incrementCounter('vera_sybil_blocked_total'); }
  recordComplianceCheck() { this.incrementCounter('vera_compliance_checks_total'); }
  recordComplianceBlocked() { this.incrementCounter('vera_compliance_blocked_total'); }

  // ── Block Stream metrics (HIP-1056) ───────────────────────────────────
  recordBlockReceived() { this.incrementCounter('blockstream_blocks_received_total'); }
  recordHcsMessageExtracted(count = 1) { this.incrementCounterBy('blockstream_hcs_messages_extracted_total', count); }
  recordBlockStreamError() { this.incrementCounter('blockstream_errors_total'); }
  recordBlockStreamReconnect() { this.incrementCounter('blockstream_reconnects_total'); }
  recordBlockStreamDivergence() { this.incrementCounter('blockstream_divergence_events_total'); }
  recordProofVerificationLatency(latencyMs: number) { this.recordHistogram('blockstream_proof_verification_latency_ms', latencyMs); }
  recordGrpcReadLatency(latencyMs: number) { this.recordHistogram('blockstream_grpc_read_latency_ms', latencyMs); }
  setBlockStreamBlockNumber(blockNumber: number) { this.setGauge('blockstream_block_number', blockNumber); }
  setBlockStreamRoundNumber(roundNumber: number) { this.setGauge('blockstream_round_number', roundNumber); }
  setBlockStreamReconnectCount(count: number) { this.setGauge('blockstream_grpc_reconnect_count', count); }

  // ── Meridian BitNet metrics (research prototype) ────────────────────────
  recordMeridianRequest() { this.incrementCounter('meridian_requests_total'); }
  recordMeridianError() { this.incrementCounter('meridian_errors_total'); }
  recordMeridianFallback() { this.incrementCounter('meridian_fallbacks_total'); }
  recordMeridianLatency(latencyMs: number) { this.recordHistogram('meridian_latency_ms', latencyMs); }
  setMeridianAccuracy(score: number) { this.setGauge('meridian_accuracy_score', score); }

  // ── Aggregate ─────────────────────────────────────────────────────────
  setTotalSettledHbar(amount: number) { this.setGauge('vera_total_settled_hbar', amount); }

  private incrementCounterBy(name: string, amount: number) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + amount);
  }

  private incrementCounter(name: string) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + 1);
  }

  private recordHistogram(name: string, value: number) {
    const values = this.histograms.get(name) || [];
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(name, values);
  }

  private setGauge(name: string, value: number) {
    this.gauges.set(name, value);
  }

  getMetrics(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    // Histograms
    for (const [name, values] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;
        
        lines.push(`${name}_sum ${sum}`);
        lines.push(`${name}_count ${count}`);
        
        // Calculate percentiles
        const sorted = [...values].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        lines.push(`${name}_quantile{quantile="0.5"} ${p50}`);
        lines.push(`${name}_quantile{quantile="0.95"} ${p95}`);
        lines.push(`${name}_quantile{quantile="0.99"} ${p99}`);
      }
    }

    // Gauges
    for (const [name, value] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }

    return lines.join('\n') + '\n';
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getHistogramStats(name: string): { count: number; sum: number; avg: number } | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      sum,
      avg: sum / values.length
    };
  }

  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }
}

export function createPrometheusMetrics(): PrometheusMetrics {
  return new PrometheusMetrics();
}

// ─── Singleton for direct use across modules ────────────────────────────────
export const prometheus = createPrometheusMetrics();
