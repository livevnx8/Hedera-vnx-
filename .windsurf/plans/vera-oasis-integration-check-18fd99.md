# Vera Oasis Integration Verification Plan

This plan outlines the steps to verify that all recent major features for Vera Oasis have been correctly integrated into the application.

## Verification Steps

1.  **Flower of Life Orchestrator**
    *   [ ] Review `@/home/vera-live-0-1/hedera-llm-api/src/vera/orchestrator/flowerOfLifeOS.ts` for correctness.
    *   [ ] Check integration points in `hierarchicalCoordinator.ts` and `vera/index.ts`.
    *   [ ] Verify that API endpoints are registered in `@/home/vera-live-0-1/hedera-llm-api/src/routes/vera.ts`.

2.  **Sovereign Agent Tool-Use**
    *   [ ] Audit `@/home/vera-live-0-1/hedera-llm-api/src/llm/sovereignRouter.ts` to confirm the tool-use fix.
    *   [ ] Ensure XML tool instructions are generated and injected into the prompt.
    *   [ ] Verify that the response parsing and tool execution logic is correct.

3.  **x402 Micropayments**
    *   [ ] Search the codebase for `x402` to identify all related files.
    *   [ ] Analyze the integration points to confirm the payment handler is connected to the orchestrator.
    *   [ ] Check for necessary configuration variables in `config.ts` and `.env.example`.

4.  **New Agent Kit Tools**
    *   [ ] Cross-reference the new tools listed in memory with the definitions in `@/home/vera-live-0-1/hedera-llm-api/src/agent/definitions.ts`.
    *   [ ] Check the system prompt at `@/home/vera-live-0-1/hedera-llm-api/src/agent/system.ts` to ensure the new capabilities are described to the agent.
