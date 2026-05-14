# Vera Oasis Evolution Plan

This plan outlines a multi-faceted upgrade for the Vera Oasis platform, focusing on enhancing the user experience, expanding AI capabilities, and optimizing operational costs.

### Phase 1: UI/UX Overhaul & Cost Optimization

**1. Modern Dashboard Implementation**
*   **Objective**: Replace the existing static HTML dashboards with a modern, real-time single-page application (SPA).
*   **Actions**:
    *   Create a new React application in a `/ui` directory.
    *   Develop components to visualize the Flower of Life lattice, agent status, and HCS transaction flow in real-time.
    *   Integrate with the existing API endpoints, including the new `/api/vera/lattice/*` routes.

**2. Cost-Effective HCS Logging**
*   **Objective**: Reduce the cost of HCS logging while maintaining a clear heartbeat.
*   **Actions**:
    *   Modify the `hcsDomainLogger` to support message batching. Instead of one transaction per event, it will collect events and submit them in a single, larger transaction.
    *   Introduce a "heartbeat" event that is logged at a regular interval (e.g., every 30 seconds) but contains a summary of system activity, rather than just being an empty pulse.

### Phase 2: Lattice and Agent Intelligence Upgrade

**1. Dynamic Lattice Expansion**
*   **Objective**: Enable the Flower of Life lattice to expand and contract based on system load, optimizing resource usage.
*   **Actions**:
    *   In `flowerOfLifeOS.ts`, enable the `dynamicMode` configuration.
    *   Implement logic in the `hierarchicalCoordinator` to monitor system load and trigger lattice expansion or hibernation.

**2. Vera Core Intelligence Upgrade**
*   **Objective**: Enhance Vera's reasoning and task-completion capabilities.
*   **Actions**:
    *   Initiate a fine-tuning process for the `llama3.1:8b` model using the data in the `/fine-tuning` directory.
    *   Focus the fine-tuning on complex, multi-step tasks that require tool use, using the existing logs as a dataset.

### Phase 3: Advanced Features & Integration

**1. Interactive Lattice Management**
*   **Objective**: Allow for direct interaction with the lattice through the new UI.
*   **Actions**:
    *   Add features to the new dashboard to manually trigger a `pulse`, assign agents to specific nodes, and view the energy flow.

**2. Enhanced Observability**
*   **Objective**: Provide deeper insights into the system's health and performance.
*   **Actions**:
    *   Integrate the new UI with the existing Prometheus and Grafana monitoring stack.
    *   Create a dedicated Grafana dashboard for visualizing lattice health, HCS transaction costs, and agent performance.
