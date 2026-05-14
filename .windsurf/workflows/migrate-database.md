---
description: Migrate and manage Vera's SQLite database
---

# Migrate Database

Database migration and management for Vera lattice.

## Quick Backup

```bash
// turbo
# Backup current database
sqlite3 vera.db ".backup '/backup/vera-$(date +%Y%m%d).db'"

# Verify backup
ls -lh /backup/vera-*.db | tail -5
```

## Schema Migrations

### 1. Check Current Schema

```bash
// turbo
# View tables
sqlite3 vera.db ".tables"

# View schema
sqlite3 vera.db ".schema"

# Check table info
sqlite3 vera.db "PRAGMA table_info(agents);"
```

### 2. Create Migration

```bash
// turbo
# New migration file
cat > migrations/001_add_agent_status.sql << 'EOF'
-- Add status column to agents table
ALTER TABLE agents ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE agents ADD COLUMN last_beacon INTEGER;

-- Create index
CREATE INDEX idx_agent_status ON agents(status);

-- Update existing records
UPDATE agents SET status = 'active' WHERE status IS NULL;
EOF
```

### 3. Run Migration

```bash
// turbo
# Apply migration
sqlite3 vera.db < migrations/001_add_agent_status.sql

# Verify
sqlite3 vera.db "PRAGMA table_info(agents);"
```

## Data Export/Import

### Export to JSON

```bash
// turbo
# Export all agents
sqlite3 vera.db "SELECT json_object('id', id, 'name', name, 'status', status) FROM agents;" > agents-export.json

# Export lattice state
node -e "
import { exportLattice } from './src/db/export.js';
await exportLattice.toJSON('lattice-export.json');
"
```

### Import from JSON

```bash
// turbo
# Import agents
node -e "
import { importAgents } from './src/db/import.js';
await importAgents.fromJSON('agents-export.json');
"
```

## Database Optimization

```bash
// turbo
# Vacuum to reclaim space
sqlite3 vera.db "VACUUM;"

# Analyze for query optimization
sqlite3 vera.db "ANALYZE;"

# Check integrity
sqlite3 vera.db "PRAGMA integrity_check;"
```

## Migration Checklist

- [ ] Backup current database
- [ ] Test migration on copy
- [ ] Run migration with logging
- [ ] Verify schema changes
- [ ] Test application queries
- [ ] Document changes

## Rollback

```bash
// turbo
# If migration fails, restore from backup
cp /backup/vera-20240115.db vera.db

# Or use Vera's restore API
curl -X POST http://localhost:8088/api/admin/db/restore \
  -d '{"backup": "/backup/vera-20240115.db"}'
```
