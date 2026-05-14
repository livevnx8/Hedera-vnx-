---
description: DID/VC issuance, verifiable credentials on Hedera
---

# Setup Identity & DID

Decentralized Identity via Hedera DID method + Verifiable Credentials.

## Install

```bash
// turbo
npm install @hashgraph/did-sdk-js @hashgraph/sdk
```

## Create DID

```bash
curl -X POST http://localhost:8088/api/identity/did/create \
  -d '{"network":"mainnet","topicId":"0.0.XXXX"}'

# Returns:
# {
#   "did": "did:hedera:mainnet:z6MkXXXX_0.0.YYYY",
#   "publicKey": "...",
#   "privateKey": "..."
# }
```

## Issue Verifiable Credential

```bash
curl -X POST http://localhost:8088/api/identity/vc/issue \
  -d '{
    "issuer": "did:hedera:mainnet:z6MkIssuer",
    "subject": "did:hedera:mainnet:z6MkSubject",
    "credentialType": "CarbonOffsetVerification",
    "claims": {
      "tonnesRetired": 7.298,
      "registry": "0.0.10416187",
      "verifiedAt": "2026-04-23T12:00:00Z"
    },
    "expirationDate": "2027-04-23T00:00:00Z"
  }'
```

## Verify Credential

```bash
curl -X POST http://localhost:8088/api/identity/vc/verify \
  -d '{"credential":{...}}'

# Returns:
# {
#   "valid": true,
#   "issuerVerified": true,
#   "signatureValid": true,
#   "notExpired": true,
#   "notRevoked": true
# }
```

## Selective Disclosure

```bash
# Create presentation with only required fields
curl -X POST http://localhost:8088/api/identity/vp/create \
  -d '{
    "credential": {...},
    "disclose": ["tonnesRetired", "verifiedAt"],
    "holder": "did:hedera:mainnet:..."
  }'
```

## Revocation Registry

```bash
# Revoke credential
curl -X POST http://localhost:8088/api/identity/vc/revoke \
  -d '{"credentialId":"vc-001","reason":"superseded"}'

# Check status
curl http://localhost:8088/api/identity/vc/status/vc-001 | jq .
```

## Zero-Knowledge Proofs

```bash
# Prove "tonnes >= 5" without revealing exact value
curl -X POST http://localhost:8088/api/identity/zkp/create \
  -d '{
    "credential": {...},
    "proof": {
      "attribute": "tonnesRetired",
      "predicate": ">=",
      "value": 5
    }
  }'
```

## Integration with Lattice

```bash
# Every agent in Flower of Life has a DID
curl http://localhost:8088/api/vera/agents | jq '.agents[] | .{id, did, verified}'
```
