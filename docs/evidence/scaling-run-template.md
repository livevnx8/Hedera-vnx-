# VeraLattice Scaling Evidence Run

Use this template when promoting the scaling layer from infrastructure-ready toward testnet-ready or production.

## Run Metadata

- Date:
- Operator:
- Environment:
- Namespace: `vera`
- Network:
- Dry run:
- Commit/build ID:
- Evidence packet:

## Promotion Target

- Current label:
- Requested label:
- Decision:
- Decision owner:

## Cluster Evidence

Commands:

```bash
kubectl get all -n vera
kubectl get hpa -n vera
kubectl describe hpa vera-lattice-hpa -n vera
kubectl rollout status deployment/vera-lattice -n vera
kubectl describe deployment vera-lattice -n vera
```

Record:

- Pod count before load:
- Ready pod count:
- Service status:
- HPA min/max:
- Current CPU/memory/custom metrics:
- Rollout status:
- Probe status:
- CrashLoopBackOff or restart count:

## Autoscaling Evidence

Load method:

```bash
# Example only. Use the load generator appropriate for the target environment.
kubectl get hpa -n vera -w
kubectl get pods -n vera -w
```

Record:

- Start time:
- End time:
- Starting replicas:
- Peak replicas:
- Final replicas:
- Scale-up latency:
- Scale-down behavior:
- Failed scheduling events:
- Notes:

## Health Evidence

Commands:

```bash
kubectl logs -n vera deployment/vera-lattice --tail=100
```

Record:

- Readiness endpoint:
- Liveness endpoint:
- Error rate:
- Recent application errors:
- Operator action needed:

## Cost Evidence

Commands:

```bash
npx tsx scripts/cost-report.ts
npx tsx scripts/cost-report.ts --json
```

Record:

- Runtime samples:
- Baseline monthly cost:
- Projected savings:
- Observed cost per request:
- Observed cost per Hedera transaction:
- Remaining instrumentation gaps:

## Model Promotion Evidence

Commands:

```bash
npx tsx scripts/validate-checkpoint.ts <checkpoint-path>
```

Record:

- Checkpoint:
- Validation score:
- Required threshold:
- Hot-swap strategy:
- Canary split:
- Rollback result:

## Ledger and Proof Evidence

Record only compact references:

- HCS topic ID:
- HCS transaction ID:
- Settlement record:
- Reputation update:
- Dashboard metric:
- HIP-1056 block-stream reference:

## Gaps

- Missing evidence:
- Risk:
- Required follow-up:

## Final Decision

- Promote:
- Hold:
- Roll back:
- Notes:
