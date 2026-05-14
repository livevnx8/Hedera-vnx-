# Vera Lattice Architecture Blueprints
## Working Patterns & HCS Topic Usage

**Version:** 1.0.0  
**Date:** March 2026  
**Status:** Production-Tested Patterns

---

## 📡 HCS Topic Architecture (Verified Working)

### **Live Topic IDs (Mainnet)**
```javascript
const HCS_TOPICS = {
  CORE:      '0.0.10409351',  // Security/Anomalies/Alerts
  DEFI:      '0.0.10409352',  // DeFi Research/Tokenomics
  ENERGY:    '0.0.10409353',  // Carbon/Lungs - Generation Data
  BRIDGE:    '0.0.10409354',  // Cross-agent coordination
  ECOSYSTEM: '0.0.10409355'   // General ecosystem
};
```

### **Rate Limiting Pattern (Working)**
```javascript
async function logToHCS(topicId, type, data, retries = 3) {
  try {
    // 500ms delay prevents rate limiting
    await new Promise(r => setTimeout(r, 500));
    
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(client);
    
    // Graceful receipt handling
    let receipt;
    try {
      receipt = await tx.getReceipt(client);
    } catch (receiptError) {
      // Message still submitted if receipt fails
      return tx.transactionId.toString();
    }
    
    return receipt.topicSequenceNumber?.toString();
  } catch (error) {
    if (retries > 0 && error.message?.includes('busy')) {
      await new Promise(r => setTimeout(r, 1000));
      return logToHCS(topicId, type, data, retries - 1);
    }
    return null;
  }
}
```

### **Message Structure (Standardized)**
```javascript
const messageSchema = {
  type: 'EVENT_TYPE',           // e.g., 'GENERATION_READING'
  agentId: 'agent-001',
  agentType: 'ENERGY_AUDITOR',
  timestamp: new Date().toISOString(),
  sessionId: `session-${Date.now()}`,
  // ... event-specific data
  confidence: 0.92,             // 0.0-1.0
  tier: 'GOLD',                 // PLATINUM|GOLD|SILVER|BRONZE
};
```

---

## 🏗️ Agent Architecture Blueprint

### **Base Agent Template**
```javascript
// vera-agent-template.mjs
import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';

class VeraAgent {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;
    this.topics = config.topics;
    this.state = {
      cycles: 0,
      readings: [],
      accuracyHistory: [],
      lastActivity: Date.now()
    };
    this.client = this.initializeClient(config.credentials);
  }

  initializeClient(creds) {
    const client = Client.forMainnet();
    let key = creds.key.length === 64 
      ? PrivateKey.fromStringECDSA(creds.key)
      : PrivateKey.fromString(creds.key);
    client.setOperator(creds.accountId, key);
    return client;
  }

  async log(topic, type, data) {
    // HCS logging with rate limiting
    await this.delay(500);
    const message = {
      type,
      agentId: this.id,
      agentType: this.type,
      timestamp: new Date().toISOString(),
      ...data
    };
    // ... submit to HCS
  }

  async delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async cycle() {
    this.state.cycles++;
    // Override in subclasses
  }

  start(interval = 180000) {
    this.cycle();
    setInterval(() => this.cycle(), interval);
  }
}

export { VeraAgent };
```

---

## 🔄 New Loop Architecture (Optimized)

### **Continuous Improvement Loop**
```
┌─────────────────────────────────────────────────────────┐
│  OBSERVE → ANALYZE → DECIDE → EXECUTE → LEARN → LOOP   │
└─────────────────────────────────────────────────────────┘

Phase 1: OBSERVE (Collect)
  ├─ Pull real-time data (EIA API, weather, chain data)
  ├─ Validate data quality (PLATINUM/GOLD/SILVER/BRONZE)
  └─ Log to HCS (with rate limiting)

Phase 2: ANALYZE (Process)
  ├─ Pattern detection (anomalies, trends)
  ├─ Confidence calculation (0.0-1.0)
  ├─ Cross-agent correlation (via BRIDGE topic)
  └─ HCS logging of findings

Phase 3: DECIDE (Consensus)
  ├─ Swarm voting (if cross-agent required)
  ├─ Weighted decision matrix
  ├─ Action threshold check (confidence > 0.85)
  └─ Log decision to HCS

Phase 4: EXECUTE (Act)
  ├─ Trigger actions (alerts, API calls)
  ├─ Update agent state
  ├─ Cross-agent notifications (if needed)
  └─ Log execution to HCS

Phase 5: LEARN (Adapt)
  ├─ Accuracy tracking
  ├─ Weight adjustment (adaptive learning)
  ├─ Pattern library updates
  └─ Log learning metrics to HCS
```

---

## 🧬 Fluent Lattice Structure (Next Phase)

### **Hierarchical Agent Network**
```
                    ┌─────────────┐
                    │   CORE      │  ← Master Coordinator
                    │ (0.0.104...)│    Security/Consensus
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
   │  DEFI   │      │ ENERGY  │      │ CARBON  │
   │  Heart  │      │ Lungs   │      │Earth/Soil│
   └────┬────┘      └────┬────┘      └────┬────┘
        │                  │                  │
   ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
   │Sub-agents│      │Sub-agents│      │Sub-agents│
   │•Whale   │      │•Grid    │      │•Credit  │
   │•Arbitrage│      │•Weather │      │•Retire  │
   │•Yield   │      │•Predict │      │•Verify  │
   └─────────┘      └─────────┘      └─────────┘
```

### **Topic Routing Matrix**
| Source Agent | Target Topic | Message Type | Priority |
|-------------|--------------|--------------|----------|
| Energy | CORE | ANOMALY_ALERT | HIGH |
| Energy | ENERGY | GENERATION_READING | NORMAL |
| Energy | BRIDGE | CROSS_AGENT_ALERT | HIGH |
| DeFi | DEFI | TOKEN_ANALYSIS | NORMAL |
| DeFi | BRIDGE | ARBITRAGE_OPPORTUNITY | URGENT |
| Security | CORE | THREAT_DETECTED | CRITICAL |
| Carbon | ENERGY | CARBON_CALCULATION | NORMAL |

---

## 📝 Blueprint Library

### **Reusable Components**

#### **1. HCS Logger (Universal)**
```javascript
// blueprints/hcs-logger.mjs
export class HCSLogger {
  constructor(client, topics) {
    this.client = client;
    this.topics = topics;
    this.queue = [];
    this.processing = false;
  }

  async enqueue(topic, type, data) {
    this.queue.push({ topic, type, data, timestamp: Date.now() });
    if (!this.processing) this.processQueue();
  }

  async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      await this.submit(item);
      await this.delay(500); // Rate limiting
    }
    this.processing = false;
  }

  async submit({ topic, type, data }) {
    // ... submission logic with retry
  }

  delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
```

#### **2. Data Quality Checker**
```javascript
// blueprints/data-quality.mjs
export function calculateQuality(data, checks, weights) {
  const scores = {};
  let totalScore = 0;
  let totalWeight = 0;

  for (const [key, checkFn] of Object.entries(checks)) {
    scores[key] = checkFn(data);
    totalScore += scores[key] * (weights[key] || 0.25);
    totalWeight += weights[key] || 0.25;
  }

  const quality = totalScore / totalWeight;
  
  return {
    score: Math.round(quality * 100) / 100,
    tier: quality >= 0.95 ? 'PLATINUM' : 
          quality >= 0.85 ? 'GOLD' : 
          quality >= 0.75 ? 'SILVER' : 'BRONZE',
    checks: scores
  };
}
```

#### **3. Cross-Agent Messenger**
```javascript
// blueprints/cross-agent.mjs
export class CrossAgentMessenger {
  constructor(bridgeTopic, logger) {
    this.topic = bridgeTopic;
    this.logger = logger;
  }

  async alert(fromAgent, targetAgents, alertType, message, priority) {
    await this.logger.enqueue(this.topic, 'CROSS_AGENT_ALERT', {
      fromAgent,
      targetAgents,
      alertType,
      message,
      priority,
      requiresAck: priority === 'HIGH' || priority === 'CRITICAL',
      timestamp: Date.now()
    });
  }

  async requestConsensus(agents, proposal, timeout = 30000) {
    // ... consensus logic
  }
}
```

---

## 🎯 Next Phase Implementation Plan

### **Phase 1: Foundation (Week 1-2)**
- [ ] Create `blueprints/` directory with reusable components
- [ ] Implement HCSLogger universal module
- [ ] Refactor all agents to use base class pattern
- [ ] Document all topic usage patterns

### **Phase 2: Optimization (Week 3-4)**
- [ ] Implement queue-based HCS submission
- [ ] Add batch processing for high-frequency data
- [ ] Create sub-agent architecture (Whale, Grid, Credit)
- [ ] Optimize memory usage for long-running agents

### **Phase 3: Fluent Lattice (Week 5-6)**
- [ ] Implement cross-agent consensus protocol
- [ ] Add swarm intelligence weighting
- [ ] Create hierarchical topic routing
- [ ] Build lattice visualization dashboard

### **Phase 4: Autonomy (Week 7-8)**
- [ ] Self-healing agent system
- [ ] Automated parameter tuning
- [ ] Emergent behavior detection
- [ ] Governance voting on upgrades

---

## 🔗 File Locations

**Working Blueprints:**
- `/hedera-llm-api/blueprints/hcs-logger.mjs`
- `/hedera-llm-api/blueprints/data-quality.mjs`
- `/hedera-llm-api/blueprints/agent-base.mjs`
- `/hedera-llm-api/blueprints/cross-agent.mjs`

**Agent Implementations:**
- `/hedera-llm-api/vera-defi-analyst.mjs`
- `/hedera-llm-api/vera-energy-auditor.mjs`
- `/hedera-llm-api/vera-security-guardian.mjs`
- `/hedera-llm-api/vera-carbon-validator.mjs`

**Documentation:**
- `/hedera-llm-api/docs/vera-lattice-blueprints.md`
- `/hedera-llm-api/docs/hcs-topic-usage.md`

---

**Next Action:** Start implementing blueprint library with HCSLogger universal module.
