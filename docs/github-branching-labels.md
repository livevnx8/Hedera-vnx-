# GitHub Branching and Labeling Policy

This repository distinguishes core product work from research and experimental work.
Use this policy to keep the VNX flagship marketplace clean, and to keep prototype or learning lanes separate.

## Branching

- `main`
  - Production-ready code only.
  - Should contain stable releases, tested product features, and release-ready documentation.

- `feature/vnx-marketplace/*`
  - Core marketplace and orchestrator enhancements.
  - New product-facing capabilities that are intended for the flagship VNX loop.
  - Keep these branches small and focused on production-grade behavior.

- `feature/experimental-research/*`
  - Research, prototype, and model experimentation work.
  - Use for advanced intelligence, tool lab, and non-core routing experiments.
  - Do not merge into `main` without an explicit product readiness review.

- `chore/branding/*`, `chore/docs/*`, `chore/cleanup/*`
  - Non-feature work such as documentation, branding, config cleanup, or refactor-only changes.

## Labels

Use labels to signal the intent and stability of a pull request.

- `core/product`
  - Changes that directly impact the flagship VNX marketplace or orchestrator.
  - Stable production work that should be held to the product readiness bar.

- `research/experimental`
  - Prototype work, model experiments, or auxiliary intelligence surfaces.
  - Should be treated as lower-stability and not shown as core product until promoted.

- `branding`
  - Identity updates, public-facing naming, and messaging improvements.

- `docs`
  - Documentation updates, runbook changes, or repo guidance.

- `cleanup`
  - Refactor work, code hygiene, or internal maintenance.

## Product vs Research Boundaries

### Core product surface

- The core VNX product surface is implemented by the orchestrator and marketplace routes in `src/routes/vera.ts`.
- This route group is the flagship loop for task posting, bidding, execution, verification, settlement, reputation, and proof.
- Keep this surface stable and production-focused.

### Experimental / research surface

- The other route groups in `src/routes.ts` are considered research or auxiliary surfaces.
- Examples include `optmizationRoutes`, `registerCompetitiveRoutes`, `registerEnhancedRoutes`, `registerSuperintelligenceRoutes`, `registerQVXIntelligenceRoutes`, `registerQuantumDuetRoutes`, `reasoningRoutes`, `registerAgentLabRoutes`, and `registerHBARAgentRoutes`.
- These routes can evolve faster and may be promoted later once they meet the product readiness bar.

## Naming guidance

- Public-facing identity should use `VNX` and the flagship route surface should be described as the VNX marketplace.
- Internal compatibility names such as `Vera` or `VERA_*` may remain in implementation details for now, but they should not become the public-facing brand.
- Keep new public docs and API descriptions aligned with the VNX brand.

## Product docs

- Use `docs/vnx-product-overview.md` for a clean product-facing summary of VNX.
- Use `VNX_PRODUCT_PATH.md` for production readiness, proof, and product claim guidance.
