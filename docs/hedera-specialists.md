# Hedera Specialists

`HederaSpecialistSwarm` is the public Vera OS wrapper around the advanced Hedera VNX specialist orchestrator.

```python
from vera_os import HederaSpecialistSwarm

swarm = HederaSpecialistSwarm()
print(swarm.status())
```

The swarm exposes:

- `specialist_types()` for IDs and specialization labels.
- `status()` for lightweight readiness without running every specialist.
- `run_all()` for full specialist execution.
- `alerts()` for a compact alert-focused result.

## Specialist Families

The current advanced swarm covers Hedera infrastructure, market intelligence, security, governance, economics, and cross-chain health. Examples include HCS consensus, HTS tokens, network health, staking, contract monitoring, transaction volume, volatility, trend, liquidity, sentiment, whale watch, flash-loan detection, bridge health, treasury monitoring, proposal tracking, anomaly detection, and fee optimization.

## Operational Outputs

Full swarm runs return overall status, active specialist count, total specialists, average confidence, alert counts, latency, per-specialist results, and top alerts. These outputs are designed to feed API responses, dashboards, health checks, and operator review.
