---
description: Manage secrets and environment variables
---

# Manage Secrets

Securely manage API keys and credentials.

## Environment Setup

```bash
// turbo
# Copy example
cp .env.example .env

# Generate secrets
export HEDERA_OPERATOR_KEY=$(openssl rand -hex 32)
export JWT_SECRET=$(openssl rand -hex 32)
export REDIS_PASSWORD=$(openssl rand -hex 16)
```

## Secret Rotation

```bash
// turbo
# Rotate Hedera keys
curl -X POST http://localhost:8088/api/admin/rotate-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update environment
source .env
pm2 restart vera
```

## Encrypt Sensitive Data

```bash
// turbo
# Encrypt .env for storage
gpg --symmetric --cipher-algo AES256 .env
mv .env.gpg /secure/vera-env.gpg

# Decrypt when needed
gpg --decrypt /secure/vera-env.gpg > .env
```

## Vault Integration

```bash
// turbo
# HashiCorp Vault
export VAULT_ADDR=https://vault.vera.network
export VAULT_TOKEN=$(cat /secure/vault-token)

# Fetch secrets
vault kv get secret/vera/production
```

## Secret Checklist

- [ ] No secrets in git
- [ ] .env in .gitignore
- [ ] Encrypted backups
- [ ] Regular rotation
- [ ] Access logging
