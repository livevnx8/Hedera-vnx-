---
description: Setup HashiCorp Vault for secret management
---

# Setup Vault

Enterprise secret management with HashiCorp Vault.

## Quick Install

```bash
// turbo
# Install Vault via Helm
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault hashicorp/vault \
  --set "server.dev.enabled=true" \
  --set "ui.enabled=true"

# Port forward UI
kubectl port-forward svc/vault 8200:8200
# Open http://localhost:8200
```

## Production Setup

```bash
// turbo
# Initialize Vault
vault operator init -key-shares=5 -key-threshold=3

# Unseal
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>

# Login with root token
vault login <root-token>
```

## Enable Secrets Engines

```bash
// turbo
# KV v2 for Vera secrets
vault secrets enable -path=vera kv-v2

# Database credentials
vault secrets enable database

# PKI for certificates
vault secrets enable pki
vault secrets enable -path=pki_int pki

# Transit for encryption
vault secrets enable transit
```

## Vera Secret Structure

```bash
// turbo
# Store Vera secrets
vault kv put vera/config \
  HEDERA_OPERATOR_KEY="$(cat hedera.key)" \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  JWT_SECRET="$(openssl rand -hex 32)"

# Store by environment
vault kv put vera/production/database \
  DB_HOST="vera-db.cluster-xyz.us-east-1.rds.amazonaws.com" \
  DB_PASSWORD="$(openssl rand -base64 32)"

vault kv put vera/staging/database \
  DB_HOST="vera-staging.db.local" \
  DB_PASSWORD="$(openssl rand -base64 32)"
```

## Dynamic Database Credentials

```bash
// turbo
# Configure database secret engine
vault write database/config/vera-postgresql \
  plugin_name=postgresql-database-plugin \
  allowed_roles="vera-app" \
  connection_url="postgresql://{{username}}:{{password}}@localhost:5432/vera" \
  username="vaultadmin" \
  password="vaultpassword"

# Create role with TTL
vault write database/roles/vera-app \
  db_name=vera-postgresql \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Generate dynamic credentials
vault read database/creds/vera-app
```

## Kubernetes Integration

```bash
// turbo
# Enable Kubernetes auth
vault auth enable kubernetes

# Configure K8s auth
vault write auth/kubernetes/config \
  kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443" \
  token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# Create policy
cat > vera-policy.hcl << 'EOF'
path "vera/data/production/*" {
  capabilities = ["read"]
}

path "database/creds/vera-app" {
  capabilities = ["read"]
}
EOF

vault policy write vera-app vera-policy.hcl

# Create K8s role
vault write auth/kubernetes/role/vera-app \
  bound_service_account_names=vera \
  bound_service_account_namespaces=default \
  policies=vera-app \
  ttl=1h
```

## Inject Secrets into Pods

```bash
// turbo
# Install Vault Agent Injector
helm upgrade vault hashicorp/vault \
  --set "injector.enabled=true"

# Annotate Vera deployment
cat > vera-deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vera
spec:
  template:
    metadata:
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "vera-app"
        vault.hashicorp.com/agent-inject-secret-config: "vera/data/production/config"
        vault.hashicorp.com/agent-inject-template-config: |
          {{ with secret "vera/data/production/config" -}}
          export HEDERA_OPERATOR_KEY="{{ .Data.data.HEDERA_OPERATOR_KEY }}"
          export OPENAI_API_KEY="{{ .Data.data.OPENAI_API_KEY }}"
          {{ end }}
    spec:
      serviceAccountName: vera
EOF

kubectl apply -f vera-deployment.yaml
```

## Encryption as a Service

```bash
// turbo
# Create encryption key
vault write -f transit/keys/vera-data

# Encrypt data
curl -X POST http://localhost:8200/v1/transit/encrypt/vera-data \
  -H "X-Vault-Token: $VAULT_TOKEN" \
  -d '{"plaintext": "$(echo 'sensitive data' | base64)"}'

# Decrypt data
curl -X POST http://localhost:8200/v1/transit/decrypt/vera-data \
  -H "X-Vault-Token: $VAULT_TOKEN" \
  -d '{"ciphertext": "vault:v1:..."}'

# Auto-unseal with cloud KMS
vault operator init -recovery-shares=3 -recovery-threshold=2
```

## Audit Logging

```bash
// turbo
# Enable audit
vault audit enable file file_path=/var/log/vault/audit.log

# Or syslog
vault audit enable syslog tag="vault-audit"

# Monitor secret access
tail -f /var/log/vault/audit.log | jq 'select(.operation == "read")'
```

## Auto-Unseal

```bash
// turbo
# AWS KMS auto-unseal
cat > vault-config.hcl << 'EOF'
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "arn:aws:kms:us-east-1:ACCOUNT:key/KEY-ID"
}
EOF

# GCP Cloud KMS
seal "gcpckms" {
  project    = "vera-project"
  region     = "us-central1"
  key_ring   = "vera-keyring"
  crypto_key = "vault-unseal"
}
```
