.PHONY: help install quickstart verify start stop status logs shell test setup reset update doctor clean

# Default target
help:
        @echo "Vera OS — Hedera Prediction Infrastructure"
        @echo ""
        @echo "Quick Start:"
        @echo "  make quickstart     - One-command setup (venv + install + verify)"
        @echo "  make install        - Create venv and install vera-os-hedera"
        @echo "  make verify         - Run all 3 validation suites"
        @echo ""
        @echo "Examples:"
        @echo "  make predict        - Run a sample HBAR prediction"
        @echo "  make visuals        - List available visual assets"
        @echo "  make swarm          - Inspect Hedera specialist swarm"
        @echo ""
        @echo "Infrastructure:"
        @echo "  make infra-up       - Start Docker Compose production stack"
        @echo "  make infra-down     - Stop production stack"
        @echo "  make infra-logs     - View production stack logs"
        @echo "  make infra-validate - Run infrastructure validation"
        @echo "  make infra-smoke    - Run quick smoke tests"
        @echo ""
        @echo "Development:"
        @echo "  make test           - Run integration tests"
        @echo "  make start          - Start sandbox"
        @echo "  make stop           - Stop sandbox"
        @echo "  make status         - Check sandbox status"
        @echo "  make clean          - Clean up Docker resources"

# ─── Plug-and-play targets ───────────────────────────────────────────
install:
        @python3 -m venv .venv
        @. .venv/bin/activate && pip install -e ".[production]" --quiet 2>/dev/null || . .venv/bin/activate && pip install -e . --quiet
        @echo "✅ Installed. Run: source .venv/bin/activate"

quickstart:
        @bash quickstart.sh

verify:
        @python3 tests/validate_vera_os_release.py
        @python3 tests/validate_infrastructure.py
        @python3 tests/smoke_test.py

predict:
        @python3 examples/vera_os_predict_hbar.py --predict

visuals:
        @python3 examples/vera_os_visual_assets.py

swarm:
        @python3 examples/vera_os_run_hedera_swarm.py

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
