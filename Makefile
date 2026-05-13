.PHONY: help start stop status logs shell test setup reset update doctor clean

# Default target
help:
	@echo "Vera Sandbox - Make Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup      - Configure testnet and environment"
	@echo "  make start      - Start the sandbox"
	@echo ""
	@echo "Development:"
	@echo "  make stop       - Stop the sandbox"
	@echo "  make restart    - Restart the sandbox"
	@echo "  make status     - Check sandbox status"
	@echo "  make logs       - View sandbox logs"
	@echo "  make shell      - Enter sandbox container"
	@echo ""
	@echo "Testing:"
	@echo "  make test       - Run integration tests"
	@echo "  make test-e2e   - Run end-to-end tests"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up        - Start production Docker Compose stack"
	@echo "  make infra-down      - Stop production stack"
	@echo "  make infra-logs      - View production stack logs"
	@echo "  make infra-validate  - Run infrastructure validation suite"
	@echo "  make infra-smoke     - Run quick smoke tests"
	@echo ""
	@echo "Maintenance:"
	@echo "  make update     - Update sandbox images"
	@echo "  make reset      - Reset all data (DESTRUCTIVE)"
	@echo "  make doctor     - Diagnose issues"
	@echo "  make clean      - Clean up Docker resources"

# Setup
setup:
	@./scripts/quick-start.sh

# Lifecycle
start:
	@./vera-sandbox start

start-offline:
	@./vera-sandbox start --offline

start-monitoring:
	@./vera-sandbox start --monitoring

stop:
	@./vera-sandbox stop

restart:
	@./vera-sandbox restart

# Status & Logs
status:
	@./vera-sandbox status

logs:
	@./vera-sandbox logs

logs-api:
	@./vera-sandbox logs vera-sandbox

logs-qvx:
	@./vera-sandbox logs qvx-mock

# Development
shell:
	@./vera-sandbox shell

shell-root:
	@docker-compose -f docker-compose.sandbox.yml exec -u root vera-sandbox sh

# Testing
test:
	@./scripts/test-sandbox.sh

test-e2e:
	@./scripts/test-e2e.sh

test-examples:
	@cd examples/sandbox && for f in *.mjs; do echo "Running $$f..."; node $$f; done

# Setup & Config
setup-testnet:
	@node scripts/setup-testnet.mjs

env:
	@if [ ! -f .env.sandbox.local ]; then cp .env.sandbox.template .env.sandbox.local; echo "Created .env.sandbox.local"; else echo ".env.sandbox.local already exists"; fi

# Maintenance
update:
	@./vera-sandbox update

reset:
	@./vera-sandbox reset

doctor:
	@./vera-sandbox doctor

clean:
	@echo "Cleaning up Docker resources..."
	@docker system prune -f
	@docker volume prune -f

# Infrastructure
infra-up:
	docker-compose -f docker-compose.production.yml up -d

infra-down:
	docker-compose -f docker-compose.production.yml down

infra-logs:
	docker-compose -f docker-compose.production.yml logs -f

infra-validate:
	@python3 tests/validate_infrastructure.py

infra-smoke:
	@python3 tests/smoke_test.py

infra-build:
	docker-compose -f docker-compose.production.yml build

infra-pull:
	docker-compose -f docker-compose.production.yml pull

# Shortcuts
up: start
down: stop
ps: status
