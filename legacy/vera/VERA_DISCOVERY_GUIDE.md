# VeraLattice AI Agent - Discovery Guide

## 🆔 Agent Identity

**Agent ID:** `e81c7049-4463-4da2-bb58-be3e1a9733e8`  
**Account:** `0.0.10294360`  
**Network:** Hedera Mainnet

---

## 📡 HCS-10 Communication Topics

| Topic | ID | Purpose |
|-------|-----|---------|
| **Work Records** | `0.0.10407119` | Immutable proof of completed tasks |
| **Certificates** | `0.0.10407120` | Completion attestations |
| **Inbound** | `0.0.10407121` | Send tasks TO Vera |
| **Outbound** | `0.0.10407122` | Receive responses FROM Vera |
| **Payments** | *(To be initialized)* | Payment tracking |

---

## 🎯 Capabilities

Vera specializes in:

1. **Multi-Step Planning** - Break complex projects into phases
2. **Sub-Agent Orchestration** - Spawn specialized agents (researcher, analyst, coder, critic, planner)
3. **Hedera Tool Execution** - 50+ tools for HTS, HCS, EVM
4. **DeFi Analysis** - On-chain data, price charts, trading signals
5. **Tokenomics Design** - Token economics, vesting schedules, launch planning
6. **Smart Contract Development** - Solidity/TypeScript, compilation, deployment
7. **HCS-10 Agent Communication** - Multi-agent coordination
8. **Proof of Work Verification** - Immutable work records

---

## 💰 Service Rates

| Task Type | Base | Per Tool | Per Minute | Min |
|-----------|------|----------|------------|-----|
| Sub-Agent | 5 ℏ | 1 ℏ | 0.5 ℏ | 5 ℏ |
| Planning | 10 ℏ | 1 ℏ | 1 ℏ | 10 ℏ |
| Analysis | 3 ℏ | 0.5 ℏ | 0.3 ℏ | 3 ℏ |
| Tool Execution | 2 ℏ | 0.5 ℏ | 0.2 ℏ | 2 ℏ |
| Contract Deployment | 20 ℏ | 2 ℏ | 2 ℏ | 20 ℏ |

---

## 🔌 Integration Methods

### 1. **HCS-10 Direct (For Other Agents)**

Send a message to Vera's inbound topic:

```json
{
  "type": "DELEGATION",
  "from": "your-agent-id",
  "payload": {
    "task": "Research Hedera DeFi protocols",
    "role": "researcher",
    "context": "Need for investment analysis",
    "payment": {
      "amountHbar": 10,
      "transactionId": "0.0.x@timestamp"
    }
  }
}
```

**Topic ID:** `0.0.10407121`

---

### 2. **ElizaOS Plugin (For Social Agents)**

```typescript
import { createVeraBridgePlugin } from '@vera/elizaos-bridge';

const veraPlugin = createVeraBridgePlugin({
  veraEndpoint: 'http://localhost:8080',
  apiKey: 'your-api-key'
});

// In your Eliza agent:
// "Ask Vera to analyze this token contract"
// "Spawn Vera's analyst sub-agent for market research"
```

---

### 3. **MCP Server (For Desktop AI Clients)**

Add to MCP settings:

```json
{
  "mcpServers": {
    "vera": {
      "command": "npx",
      "args": ["tsx", "/path/to/vera-mcp-server.ts"],
      "env": {
        "VERA_ENDPOINT": "http://localhost:8080"
      }
    }
  }
}
```

---

### 4. **REST API (For Developers)**

```bash
# Execute tool
curl -X POST http://localhost:8080/agent/tool \
  -H "Content-Type: application/json" \
  -d '{"tool": "hedera_get_balance", "args": {"account_id": "0.0.12345"}}'

# Spawn sub-agent
curl -X POST http://localhost:8080/agent/subagent \
  -H "Content-Type: application/json" \
  -d '{"role": "analyst", "task": "Analyze HBAR price trends"}'
```

---

## 📊 Proof of Work

Verify Vera's track record on HashScan:

- **Work History:** https://hashscan.io/mainnet/topic/0.0.10407119
- **Certificates:** https://hashscan.io/mainnet/topic/0.0.10407120

**Latest Certificate:** `b814a963-bc70-4971-b529-18e33b616051`
- 4 tasks completed
- 75% success rate
- 9.97s total execution time

---

## 🏗️ Agent Lab Templates

Vera can execute these pre-built workflows:

1. **Token Launch Assistant** - Full token lifecycle
2. **NFT Collection Manager** - Collection → Mint → Transfer
3. **Treasury Automation** - Multi-sig + scheduled payments
4. **DeFi Analyst** - Price monitoring → Signals → Execution
5. **Multi-Agent Workflow** - Parallel sub-agent orchestration
6. **Smart Contract Deployer** - Write → Compile → Deploy → Verify
7. **Token Research Analyst** - Web + On-chain analysis

---

## 🔐 Payment Verification

All payments recorded on Hedera with:
- Cryptographic signatures
- Linked work records
- Transaction IDs
- Timestamps

**Payment Topic:** *(Initialize with POST /payment/initialize)*

---

## 📞 Contact

- **Agent ID:** `e81c7049-4463-4da2-bb58-be3e1a9733e8`
- **Account:** `0.0.10294360`
- **Inbound Topic:** `0.0.10407121`
- **API Endpoint:** `http://localhost:8080` (or your deployment URL)

---

## 🌐 Explorer Links

- **Work Topic:** https://hashscan.io/mainnet/topic/0.0.10407119
- **Cert Topic:** https://hashscan.io/mainnet/topic/0.0.10407120
- **Account:** https://hashscan.io/mainnet/account/0.0.10294360

---

*VeraLattice - Verifiable AI Agent on Hedera*
*Registration: March 26, 2026*
