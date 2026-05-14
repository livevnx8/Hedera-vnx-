---
description: Automated carbon credit verification with AI + oracle consensus
---

# Auto Carbon Verification

End-to-end automated verification of carbon credits before retirement.

## Verification Pipeline

```
Credit Claim → Satellite/IoT Data → AI Verification → Oracle Consensus → HCS Audit Log → Retire on 0.0.10416187
```

## Verification API

```bash
curl -X POST http://localhost:8088/api/carbon/verify \
  -d '{
    "projectId": "PROJ-001",
    "tonnesClaimed": 100,
    "methodology": "VCS-VM0042",
    "geospatialProof": "ipfs://QmXXX/satellite.json",
    "iotSensorData": "ipfs://QmYYY/sensors.json"
  }'
```

## AI Model Check

```bash
cat > scripts/carbon-ai-verify.mjs << 'EOF'
import fetch from 'node-fetch';

async function verifyWithAI(claim) {
  // Run through Vera's QVX model
  const result = await fetch('http://localhost:8088/api/ai/generate', {
    method: 'POST',
    body: JSON.stringify({
      query: `Verify carbon claim: ${JSON.stringify(claim)}. Return {verified: bool, confidence: 0-1, flags: []}`,
      model: 'vera-qvx-v7'
    })
  }).then(r => r.json());
  
  return result;
}

const claim = JSON.parse(process.argv[2]);
const verification = await verifyWithAI(claim);
console.log(JSON.stringify(verification, null, 2));
EOF
```

## Oracle Consensus

```bash
# Verify with multiple oracles
curl -X POST http://localhost:8088/api/carbon/oracle-consensus \
  -d '{
    "projectId": "PROJ-001",
    "oracles": ["verra", "gold-standard", "puro"],
    "threshold": 2
  }'
```

## Auto-Retire on Success

```bash
cat > scripts/auto-retire.mjs << 'EOF'
import fetch from 'node-fetch';

async function autoRetire(projectId) {
  // 1. AI verification
  const aiCheck = await fetch(`/api/carbon/verify/${projectId}`).then(r => r.json());
  if (!aiCheck.verified || aiCheck.confidence < 0.9) {
    return { status: 'rejected', reason: 'ai-fail' };
  }
  
  // 2. Oracle consensus
  const oracleCheck = await fetch(`/api/carbon/oracle-consensus/${projectId}`).then(r => r.json());
  if (!oracleCheck.consensus) {
    return { status: 'rejected', reason: 'oracle-fail' };
  }
  
  // 3. Retire on HCS
  const retirement = await fetch('/api/carbon/retire', {
    method: 'POST',
    body: JSON.stringify({ projectId, verified: true })
  }).then(r => r.json());
  
  return retirement;
}

autoRetire(process.argv[2]);
EOF
```

## Audit Trail

Every verification step logs to HCS topic `0.0.10414502` (audit). Fully transparent.

```bash
# View audit trail
curl http://localhost:8088/api/carbon/audit/PROJ-001 | jq '.events[]'
```
