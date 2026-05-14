# Vera Agent Payment Orchestration
Design and implement Vera's Hedera-native orchestration loop to discover agents, manage task lifecycles, and settle payouts through x402 with HCS-backed auditability.

1. **Confirm configuration & topic foundations**  
   - Inventory existing Hedera config/env vars and add placeholders for registry, task queue, result queue, and audit topics (testnet + mainnet).  
   - Decide how Vera stores topic IDs (config or persistent store) and ensure utilities exist for submitting/querying messages with mirror node pagination.  
   - Map x402 credentials/endpoints into config to keep payouts sovereign on the local rig.

2. **Implement registry watcher & agent cache**  
   - Build an HCS polling module that tails the `vera-payment-registry` topic, validates JSON schema, and maintains an in-memory agent directory with freshness/availability flags.  
   - Surface metrics/diagnostics (counts, stale agents) and optional disk snapshot for restart resilience.

3. **Task publication, bidding, and escrow control**  
   - Extend Vera's orchestrator to publish task intents to the task queue topic, accept bids via designated response channels, and select winners based on confidence + fee constraints.  
   - Integrate allowance/escrow primitives: pre-authorize HTS allowances and log escrow set events to the audit topic.  
   - Model task state machine (posted → awarded → in_progress → delivered → accepted/rejected) persisted for traceability.

4. **Result verification & x402 settlements**  
   - Consume result messages, execute verification pipeline (data validation + scoring), and only advance when confidence ≥ threshold.  
   - Wire x402 payment handler to craft payout requests, record partial/complete settlement states, and broadcast HCS audit entries (payment_settled, task_complete).  
   - Handle error paths: verification failure, payment exception, allowance reclaim.

5. **Testing, observability, and rollout**  
   - Create local/testnet harness with two dummy agents and mocked tasks to exercise the full loop end-to-end.  
   - Add structured logging/prometheus hooks for topic lag, task throughput, and payment latency.  
   - Document deployment toggles and migration steps before promoting to mainnet.
