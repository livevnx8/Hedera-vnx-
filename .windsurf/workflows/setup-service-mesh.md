---
description: Setup Istio service mesh for advanced traffic management
---

# Setup Service Mesh

Istio service mesh for advanced networking.

## Quick Install

```bash
// turbo
# Download Istio
curl -L https://istio.io/downloadIstio | sh -
cd istio-*

# Install with default profile
./bin/istioctl install --set profile=default -y

# Enable injection
kubectl label namespace default istio-injection=enabled
```

## Traffic Management

### 1. Virtual Services

```bash
// turbo
cat > vera-routing.yaml << 'EOF'
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vera-routing
spec:
  hosts:
    - api.vera.network
  http:
    - match:
        - uri:
            prefix: /api/ai
      route:
        - destination:
            host: vera-ai
            subset: v2
          weight: 10
        - destination:
            host: vera-ai
            subset: v1
          weight: 90
      timeout: 30s
      retries:
        attempts: 3
        perTryTimeout: 10s
EOF

kubectl apply -f vera-routing.yaml
```

### 2. Circuit Breaking

```bash
// turbo
cat > vera-circuit-breaker.yaml << 'EOF'
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: vera-circuit-breaker
spec:
  host: vera
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
EOF

kubectl apply -f vera-circuit-breaker.yaml
```

### 3. mTLS

```bash
// turbo
# Enable strict mTLS
cat > peer-authentication.yaml << 'EOF'
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: default
spec:
  mtls:
    mode: STRICT
EOF

kubectl apply -f peer-authentication.yaml
```

## Observability

```bash
// turbo
# Kiali dashboard
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/kiali.yaml

# Access Kiali
istioctl dashboard kiali

# View service graph
# http://localhost:20001/kiali/console/graph/namespaces/
```

## Advanced Features

```bash
// turbo
# Rate limiting
kubectl apply -f - << 'EOF'
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: vera-rate-limit
spec:
  configPatches:
    - applyTo: HTTP_FILTER
      match:
        context: SIDECAR_INBOUND
      patch:
        operation: INSERT_BEFORE
        value:
          name: envoy.filters.http.local_ratelimit
          typed_config:
            '@type': type.googleapis.com/udpa.type.v1.TypedStruct
            type_url: type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
            value:
              stat_prefix: http_local_rate_limiter
              token_bucket:
                max_tokens: 100
                tokens_per_fill: 10
                fill_interval: 1s
EOF
```

## Verify Mesh

```bash
// turbo
# Check sidecar injection
kubectl get pods -l app=vera -o jsonpath='{.items[*].spec.containers[*].name}'

# View proxy config
istioctl proxy-config cluster vera-pod-xxx

# Check mTLS status
istioctl authn tls-check vera.default.svc.cluster.local
```
