#!/usr/bin/env bash
#
# Mainnet Migration Script
# Safely migrate from testnet to mainnet with full validation
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Configuration
TESTNET_ENDPOINT="${TESTNET_ENDPOINT:-https://testnet.veralattice.com}"
MAINNET_ENDPOINT="${MAINNET_ENDPOINT:-https://api.veralattice.com}"
BACKUP_DIR="${BACKUP_DIR:-./backups/migration-$(date +%Y%m%d-%H%M%S)}"
CANARY_PERCENTAGE="${CANARY_PERCENTAGE:-1}"

# Phase 1: Pre-Migration Validation
phase1_validation() {
    log "Phase 1: Pre-Migration Validation"
    
    # Check required environment variables
    required_vars=("HEDERA_OPERATOR_ACCOUNT_ID" "HEDERA_OPERATOR_KEY" "MAINNET_OPERATOR_KEY")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error "Missing required environment variable: $var"
            exit 1
        fi
    done
    
    # Verify testnet is healthy
    log "Checking testnet health..."
    if ! curl -sf "${TESTNET_ENDPOINT}/health" > /dev/null; then
        error "Testnet health check failed"
        exit 1
    fi
    
    # Verify mainnet topics exist
    log "Verifying mainnet topics..."
    node -e "
        const { topicManager } = require('./dist/src/vera/orchestrator/topicManager');
        topicManager.ensureTopics().then(topics => {
            console.log('Topics verified:', Object.keys(topics).length);
            process.exit(0);
        }).catch(err => {
            console.error('Topic verification failed:', err);
            process.exit(1);
        });
    "
    
    # Check balance
    log "Checking mainnet operator balance..."
    BALANCE=$(node -e "
        const { getClient } = require('./dist/src/hedera/tools/client');
        const { AccountBalanceQuery } = require('@hashgraph/sdk');
        const client = getClient();
        new AccountBalanceQuery()
            .setAccountId('${HEDERA_OPERATOR_ACCOUNT_ID}')
            .execute(client)
            .then(balance => console.log(balance.hbars.toTinybars() / 100000000))
            .catch(() => console.log(0));
    ")
    
    if (( $(echo "$BALANCE < 100" | bc -l) )); then
        error "Insufficient mainnet balance: ${BALANCE} HBAR (minimum 100 required)"
        exit 1
    fi
    
    log "Pre-migration validation complete"
}

# Phase 2: Create State Backup
phase2_backup() {
    log "Phase 2: Creating State Backup"
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup SQLite database
    if [[ -f "data.sqlite" ]]; then
        cp data.sqlite "$BACKUP_DIR/data.sqlite"
        log "Database backed up"
    fi
    
    # Backup HCS state
    node -e "
        const { backupManager } = require('./dist/src/vera/disaster-recovery/stateBackup');
        backupManager.forceBackup('pre_migration').then(snapshot => {
            console.log('Backup created:', snapshot.id);
            process.exit(0);
        }).catch(err => {
            console.error('Backup failed:', err);
            process.exit(1);
        });
    "
    
    # Backup configuration
    cp .env "$BACKUP_DIR/.env.testnet"
    cp deployment-config.json "$BACKUP_DIR/" 2>/dev/null || true
    
    log "State backup complete: $BACKUP_DIR"
}

# Phase 3: Dry Run
phase3_dry_run() {
    log "Phase 3: Dry Run Mode"
    
    # Enable dry run mode
    export VERA_DRY_RUN=true
    export VERA_SHADOW_MODE=true
    export HEDERA_NETWORK=mainnet
    
    # Start services in dry run mode
    log "Starting services in dry run mode..."
    npm run start:dry-run &
    DRY_RUN_PID=$!
    
    # Wait for services to start
    sleep 10
    
    # Run integration tests against dry run instance
    log "Running integration tests..."
    npm run test:integration -- --mainnet-dry-run
    
    # Cleanup
    kill $DRY_RUN_PID 2>/dev/null || true
    
    # Disable dry run
    unset VERA_DRY_RUN
    unset VERA_SHADOW_MODE
    
    log "Dry run complete"
}

# Phase 4: Canary Deployment
phase4_canary() {
    log "Phase 4: Canary Deployment (${CANARY_PERCENTAGE}%)"
    
    # Deploy canary instance
    log "Deploying canary instance..."
    
    # Update canary deployment
    kubectl set image deployment/vera-canary \
        vera=veralattice/vera:${VERSION:-latest} \
        --namespace production
    
    # Wait for canary to be ready
    kubectl rollout status deployment/vera-canary \
        --namespace production \
        --timeout=300s
    
    # Route canary traffic
    kubectl patch service vera-gateway \
        --namespace production \
        -p '{"spec":{"trafficPolicy":{"canary":{"percentage":'"$CANARY_PERCENTAGE"'}}}}'
    
    # Monitor canary for 30 minutes
    log "Monitoring canary for 30 minutes..."
    sleep 1800
    
    # Check canary metrics
    log "Checking canary health..."
    CANARY_ERRORS=$(kubectl logs -l app=vera-canary --tail=1000 | grep -c "ERROR" || true)
    
    if [[ $CANARY_ERRORS -gt 10 ]]; then
        error "Canary deployment has errors ($CANARY_ERRORS), rolling back"
        phase6_rollback
        exit 1
    fi
    
    log "Canary deployment healthy"
}

# Phase 5: Full Migration
phase5_full_migration() {
    log "Phase 5: Full Migration"
    
    warn "This will migrate all traffic to mainnet. Continue? (yes/no)"
    read -r CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        log "Migration aborted by user"
        exit 0
    fi
    
    # Update environment to mainnet
    export HEDERA_NETWORK=mainnet
    sed -i 's/HEDERA_NETWORK=testnet/HEDERA_NETWORK=mainnet/g' .env
    
    # Enable mainnet operations
    export VERA_ENABLE_MAINNET=true
    
    # Deploy to production
    log "Deploying to production..."
    kubectl set image deployment/vera-primary \
        vera=veralattice/vera:${VERSION:-latest} \
        --namespace production
    
    # Wait for rollout
    kubectl rollout status deployment/vera-primary \
        --namespace production \
        --timeout=600s
    
    # Route 100% traffic
    kubectl patch service vera-gateway \
        --namespace production \
        -p '{"spec":{"trafficPolicy":{"canary":{"percentage":0}}}}'
    
    log "Full migration complete"
}

# Phase 6: Rollback (if needed)
phase6_rollback() {
    log "Phase 6: Rollback"
    
    # Restore previous deployment
    kubectl rollout undo deployment/vera-primary --namespace production
    
    # Restore environment
    if [[ -f "$BACKUP_DIR/.env.testnet" ]]; then
        cp "$BACKUP_DIR/.env.testnet" .env
    fi
    
    # Restore database if needed
    if [[ -f "$BACKUP_DIR/data.sqlite" ]]; then
        cp "$BACKUP_DIR/data.sqlite" data.sqlite
    fi
    
    log "Rollback complete"
}

# Phase 7: Post-Migration Validation
phase7_validation() {
    log "Phase 7: Post-Migration Validation"
    
    # Health checks
    log "Running health checks..."
    curl -sf "${MAINNET_ENDPOINT}/health" || {
        error "Mainnet health check failed"
        phase6_rollback
        exit 1
    }
    
    # Verify settlements working
    log "Testing settlement flow..."
    node -e "
        const { x402Settlement } = require('./dist/src/vera/orchestrator/x402Settlement');
        x402Settlement.settle('test-task', 'test-agent', '${HEDERA_OPERATOR_ACCOUNT_ID}', 0.001)
            .then(result => {
                if (result.state === 'settled') {
                    console.log('Settlement test passed');
                    process.exit(0);
                } else {
                    console.error('Settlement test failed:', result.error);
                    process.exit(1);
                }
            })
            .catch(err => {
                console.error('Settlement test error:', err);
                process.exit(1);
            });
    "
    
    # Verify HCS messages
    log "Testing HCS message submission..."
    node -e "
        const { topicManager } = require('./dist/src/vera/orchestrator/topicManager');
        topicManager.publishToTopic('CORE', 'MIGRATION_TEST', { test: true })
            .then(() => {
                console.log('HCS test passed');
                process.exit(0);
            })
            .catch(err => {
                console.error('HCS test failed:', err);
                process.exit(1);
            });
    "
    
    log "Post-migration validation complete"
}

# Main execution
main() {
    log "Starting Mainnet Migration"
    log "Backup directory: $BACKUP_DIR"
    
    case "${1:-all}" in
        validate)
            phase1_validation
            ;;
        backup)
            phase2_backup
            ;;
        dry-run)
            phase3_dry_run
            ;;
        canary)
            phase4_canary
            ;;
        migrate)
            phase1_validation
            phase2_backup
            phase3_dry_run
            phase4_canary
            phase5_full_migration
            phase7_validation
            ;;
        rollback)
            phase6_rollback
            ;;
        all|*)
            phase1_validation
            phase2_backup
            phase3_dry_run
            phase4_canary
            phase5_full_migration
            phase7_validation
            ;;
    esac
    
    log "Migration script complete"
}

# Show help
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Mainnet Migration Script"
    echo ""
    echo "Usage: $0 [phase]"
    echo ""
    echo "Phases:"
    echo "  validate   - Run pre-migration validation"
    echo "  backup     - Create state backup"
    echo "  dry-run    - Run in dry-run mode"
    echo "  canary     - Deploy canary (1%)"
    echo "  migrate    - Run full migration"
    echo "  rollback   - Rollback to testnet"
    echo "  all        - Run complete migration (default)"
    echo ""
    echo "Environment variables:"
    echo "  HEDERA_OPERATOR_ACCOUNT_ID - Operator account"
    echo "  MAINNET_OPERATOR_KEY       - Mainnet private key"
    echo "  CANARY_PERCENTAGE          - Canary traffic % (default: 1)"
    exit 0
fi

main "$@"
