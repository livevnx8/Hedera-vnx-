# Vera OS GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a curated GitHub release branch for the strongest working Vera OS Hedera infrastructure package.

**Architecture:** Keep the public release focused on the working Python/FastAPI prediction infrastructure, Hedera specialist swarm, production Compose stack, docs, visuals, examples, and validators. Do not stage unrelated experiments, private env files, raw datasets, or heavyweight model artifacts.

**Tech Stack:** Python 3.12, FastAPI, Docker Compose, PostgreSQL, Redis, Prometheus, Grafana, Loki, Jaeger, Alertmanager, Alembic, Markdown, PNG/SVG assets.

---

### Task 1: Release Portability

**Files:**
- Modify: `prediction_server_production.py`
- Modify: `prediction_server_v3.py`
- Modify: `vnx_swarm_engine.py`
- Modify: `hedera_vnx_specialists.py`
- Modify: `hedera_vnx_specialists_extended.py`
- Modify: `hedera_vnx_specialists_advanced.py`
- Modify: `analytics_engine.py`
- Modify: `graph_data_engine.py`
- Modify: `feature_infrastructure.py`
- Modify: `auditor_specialist.py`
- Create: `vera_os/paths.py`

- [x] Replace workstation-specific absolute paths with repository-relative defaults.
- [x] Add environment overrides for `VERA_OS_HOME`, `MODELS_DIR`, data, cache, and logs.
- [x] Ensure runtime cache and log directories are created when needed.

### Task 2: Release Packaging

**Files:**
- Create: `pyproject.toml`
- Create: `requirements.txt`
- Replace: `Dockerfile`
- Create: `.dockerignore`
- Modify: `.gitignore`
- Create: `LICENSE`

- [x] Add Python package metadata for the `vera_os` facade and core top-level modules.
- [x] Replace the legacy Node Dockerfile with a Python/FastAPI production image.
- [x] Keep `.env` and `.env.production` ignored while allowing `.env.example`.
- [x] Keep local `models/` artifacts out of normal Git commits.

### Task 3: Release Documentation

**Files:**
- Modify: `README.md`
- Modify: `BUILD_MANIFEST.md`
- Modify: `docs/github-release-checklist.md`
- Create: `docs/model-artifacts.md`
- Create: `RELEASE_NOTES.md`

- [x] Add editable install command to the README.
- [x] Document the model artifact policy.
- [x] Document release notes and branch discipline.

### Task 4: Verification

**Files:**
- Modify: `tests/smoke_test.py`
- Modify: `tests/validate_infrastructure.py`

- [x] Make validators use repository-relative paths.
- [ ] Run `python3 tests/validate_vera_os_release.py`.
- [ ] Run `python3 tests/validate_infrastructure.py`.
- [ ] Run `python3 tests/smoke_test.py`.
- [ ] Run `python3 -m py_compile` over release-critical Python files.
- [ ] Render `docker compose -f docker-compose.production.yml config` with placeholder secrets.

### Task 5: Curated Git Staging

**Files:**
- No source changes.

- [ ] Create or switch to `release/vera-os-infrastructure`.
- [ ] Stage only the curated Vera OS release allowlist.
- [ ] Run a staged diff review.
- [ ] Run a secret scan against staged files.
- [ ] Commit locally with `release: prepare vera os hedera infrastructure`.
- [ ] Do not push until the staged file list and commit are reviewed.
