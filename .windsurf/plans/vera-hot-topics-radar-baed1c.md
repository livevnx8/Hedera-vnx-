# Vera Hot Topics Radar Implementation Plan

Build Vera's sovereign "Hot Topics" radar—a central intelligence system for spotting high-volume workflows across Hedera using QVX/Quantum Duet for parallel processing, with auto-discovery and smart mirror node polling.

## Architecture Decisions (Confirmed)

- **New HotTopicsManager class**: Standalone manager in `src/vera/orchestrator/hotTopicsManager.ts`
- **Extend topicPoller**: Add hot-topics detection logic to existing poller
- **Create new topic**: Dedicated `vera-hot-topics` topic (e.g., 0.0.10415XXX)
- **Known + auto-discovery**: Start with McLaren/FedEx/DeFi topics, scan for new high-volume topics weekly
- **Quantum Duet integration**: Use QuantumParallelMirrors for parallel fetching across alpha/beta/echo nodes

## Files to Create/Modify

### 1. New Files

- `src/vera/orchestrator/hotTopicsManager.ts` - Core manager for hot topics topic creation, persistence, and publishing
- `src/vera/orchestrator/hotTopicsScanner.ts` - QVX-powered scanner for volume detection and workflow classification
- `src/vera/orchestrator/hotTopicsTypes.ts` - TypeScript types for hot-topics data structures

### 2. Files to Modify

- `src/vera/orchestrator/topicPoller.ts` - Add hot-topics detection emitters and volume tracking
- `src/config.ts` - Add `VERA_HOT_TOPICS_TOPIC_ID` config variable
- `src/quantum/QuantumParallelMirrors.ts` - Enhance for topic message fetching with parallel streams
- `src/vera/orchestrator/topicManager.ts` - Add hotTopicsTopicId to PaymentTopics interface
- `src/vera/orchestrator/index.ts` - Export new hot topics components

## Implementation Phases

### Phase 1: Foundation (Day 1)

**hotTopicsTypes.ts**
- Define `HotTopicEntry`, `HotTopicsScanResult`, `WorkflowType` enums
- Define `HotTopicsConfig` with thresholds and polling intervals
- Define `VolumeDelta` and `TopicClassification` types

**hotTopicsManager.ts**
- Create `HotTopicsManager` class following `PaymentTopicManager` pattern
- Handle topic creation with memo "Vera Hot Topics Radar"
- Persist topic ID to disk (reuse `data/vera-hot-topics.json`)
- Publish method for posting scan summaries
- Falcon signature support for post-quantum security

**config.ts**
- Add `VERA_HOT_TOPICS_TOPIC_ID: z.string().optional()`

### Phase 2: QVX Scanner (Day 2)

**hotTopicsScanner.ts**
- `HotTopicsScanner` class integrating with `QuantumParallelMirrors`
- `scanTopics(topicIds: string[])` - parallel fetch across mirror nodes
- Volume calculation with time-window aggregation (msgs/hour)
- Workflow classification using pattern matching:
  - "carbon" + "audit" → "McLaren-carbon-audit"
  - "FedEx" + "route" → "FedEx-route-optim"
  - "DeFi" + "swap" → "DeFi-activity"
- Delta calculation vs. previous scan
- Action flagging: "monitor" (<200 msgs/hr), "alert" (>200 msgs/hr or unknown)

**QuantumParallelMirrors.ts enhancements**
- Add `fetchTopicMessages(topicId, cursor)` method
- Implement parallel fetching across alpha/beta/echo nodes
- Smart backoff on 429/BUSY responses
- Aggregate results with deduplication

### Phase 3: Integration (Day 3)

**topicPoller.ts extensions**
- Add `volumeTracking` Map to track message counts per topic
- Emit `volume_spike` event when threshold exceeded
- Emit `new_topic_detected` for auto-discovery
- Hook into existing poll cycle

**hotTopicsManager publishing loop**
- 5-minute scan cycle (configurable)
- Aggregate results from scanner
- Format clean JSON summary:
```json
{
  "type": "hot-scan",
  "scanTime": "1774997040302",
  "highVolume": [...],
  "newTopics": [...],
  "summary": "..."
}
```
- Submit to HCS via `TopicMessageSubmitTransaction`

**orchestratorLoop.ts integration**
- Initialize hot topics manager on startup
- Wire scanner to poller events
- Graceful shutdown cleanup

### Phase 4: Auto-Discovery & Polish (Day 4)

**Auto-discovery logic**
- Weekly scan of Hedera public topics (limited scope - top 100 by volume)
- Filter for topics with >100 msgs/hour sustained
- Cross-reference against known workflow patterns
- Add to monitored list automatically

**Dashboard/API integration**
- Add `/api/hot-topics` endpoint to expose current scan results
- WebSocket feed for real-time hot-topic updates
- Grafana dashboard panel showing volume heatmap

## Configuration

```typescript
// Default config values
HOT_TOPICS_POLL_INTERVAL_MS: 300000, // 5 minutes
HOT_TOPICS_VOLUME_THRESHOLD: 100,    // msgs/hour
HOT_TOPICS_ALERT_THRESHOLD: 200,     // msgs/hour for alert
HOT_TOPICS_MAX_MONITORED: 50,        // cap to prevent overload
HOT_TOPICS_AUTO_DISCOVERY: true,     // enable weekly scans
```

## Initial Monitored Topics

From user's plan:
- `0.0.10414316` - McLaren carbon audit
- `0.0.10414355` - FedEx route optimization
- Plus any existing VERA_*_TOPIC_IDs

## Performance Targets

- Mirror node polling: <30s for 20 topics via parallel mirrors
- CPU load: <30% during scan cycles
- Memory: <100MB for volume tracking state
- Backoff: 30s on throttle, exponential to 5min max

## Success Criteria

- [ ] Hot topics topic created and initialized with `hot-init` message
- [ ] Scans published every 5 minutes with accurate volume counts
- [ ] Workflow classification working for McLaren/FedEx/DeFi patterns
- [ ] Auto-discovery identifies and adds new high-volume topics
- [ ] Alert firing when volume spikes >200 msgs/hour
- [ ] Dashboard shows live hot-topics feed
- [ ] Zero mirror node throttling under normal load

## Rollout Steps

1. Deploy types + manager (no active scanning)
2. Create hot-topics topic, verify persistence
3. Enable scanner with 5-minute cycles
4. Tune thresholds based on real data
5. Enable auto-discovery after 1 week baseline
6. Dashboard integration

---

**Estimated effort**: 3-4 days  
**Risk areas**: Mirror node throttling (mitigated via Quantum Duet parallelization), topic ID persistence across restarts  
**Dependencies**: Existing QuantumParallelMirrors, topicPoller infrastructure
