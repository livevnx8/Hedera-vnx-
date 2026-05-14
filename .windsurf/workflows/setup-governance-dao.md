---
description: On-chain DAO governance with HCS proposals and voting
---

# Setup Governance DAO

Decentralized governance using HCS for proposals + HTS for voting tokens.

## Initialize DAO

```bash
curl -X POST http://localhost:8088/api/dao/create \
  -d '{
    "name": "Vera Lattice DAO",
    "governanceToken": "0.0.XXXX",
    "proposalTopic": "0.0.YYYY",
    "voteTopic": "0.0.ZZZZ",
    "quorum": 0.2,
    "votingPeriod": 604800
  }'
```

## Create Proposal

```bash
curl -X POST http://localhost:8088/api/dao/proposals \
  -d '{
    "title": "Add new GPU node to cluster",
    "description": "Proposal to add H100 to training cluster",
    "actions": [
      {"type": "spend", "amount": "5000", "recipient": "0.0.XXXX"}
    ],
    "votingStarts": 1710000000,
    "votingEnds": 1710604800
  }'
```

## Vote

```bash
curl -X POST http://localhost:8088/api/dao/vote \
  -d '{
    "proposalId": "prop-001",
    "vote": "for",
    "votingPower": 1000
  }'
```

## Execute Passed Proposal

```bash
curl -X POST http://localhost:8088/api/dao/execute \
  -d '{"proposalId":"prop-001"}'
```

## Vote Delegation

```bash
# Delegate voting power
curl -X POST http://localhost:8088/api/dao/delegate \
  -d '{"to":"0.0.XXXX","amount":"500"}'
```

## Treasury Management

```bash
# View treasury
curl http://localhost:8088/api/dao/treasury | jq '.{
  balance: .hbarBalance,
  tokens: .tokenHoldings,
  commitments: .pendingPayments
}'

# Treasury proposal
curl -X POST http://localhost:8088/api/dao/treasury/propose \
  -d '{
    "type": "invest",
    "asset": "HBAR",
    "amount": "10000",
    "destination": "defi_yield_farm"
  }'
```

## Analytics Dashboard

```bash
# Voter participation
curl http://localhost:8088/api/dao/analytics | jq '.{
  totalMembers: .memberCount,
  activeVoters: .activeCount,
  proposalsPassed: .passed,
  proposalsFailed: .failed,
  participationRate: .participation
}'
```
