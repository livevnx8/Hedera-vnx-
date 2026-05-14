import { describe, expect, it } from 'vitest';
import { planVnxLatticeWorkflow } from '../../vnx/latticeWorkflowPlanner.js';

describe('VNX lattice workflow planner', () => {
  it('plans parallel specialist lanes for advanced work', () => {
    const plan = planVnxLatticeWorkflow(
      'Implement a TypeScript proof API with Hedera HCS receipts and tests',
      { mode: 'parallel', maxSpecialists: 4 },
    );

    expect(plan.standard).toBe('VNX-LATTICE-WORKFLOW-1');
    expect(plan.selectedSpecialists.map((item) => item.id)).toContain('code-forge');
    expect(plan.selectedSpecialists.map((item) => item.id).some((id) => id === 'ledger-ops' || id === 'proof-kernel')).toBe(true);
    expect(plan.stages.some((stage) => stage.stage === 'specialist_parallel' && stage.parallel)).toBe(true);
    expect(plan.lanes.length).toBeGreaterThan(1);
    expect(plan.lanes.every((lane) => lane.parallelGroup === 1)).toBe(true);
  });

  it('adds proof and receipt stages in proofed mode', () => {
    const plan = planVnxLatticeWorkflow(
      'Audit the private key signing flow and produce a proof packet',
      { mode: 'proofed', maxSpecialists: 4 },
    );

    expect(plan.stages.map((stage) => stage.stage)).toContain('verification');
    expect(plan.stages.map((stage) => stage.stage)).toContain('receipt');
    expect(plan.proofGates.some((gate) => gate.includes('Security-Warden'))).toBe(true);
    expect(plan.proofGates.some((gate) => gate.includes('route metadata'))).toBe(true);
  });

  it('creates learning hooks in learning mode', () => {
    const plan = planVnxLatticeWorkflow(
      'Learn from a verified QVX telemetry workflow and improve future route weights',
      { mode: 'learning', maxSpecialists: 4 },
    );

    expect(plan.stages.at(-1)?.stage).toBe('learning');
    expect(plan.learningHooks.length).toBeGreaterThan(0);
    expect(plan.learningHooks[0].promotionGate).toContain('source workflow has proof evidence');
  });

  it('keeps adaptive weights inspectable inside lane metadata', () => {
    const plan = planVnxLatticeWorkflow(
      'Plan lattice routing topology for parallel workflows',
      { mode: 'parallel', routeWeights: { 'network-pulse': 1.5 }, maxSpecialists: 4 },
    );

    const networkLane = plan.lanes.find((lane) => lane.specialistId === 'network-pulse');
    expect(networkLane?.adaptiveWeight).toBe(1.5);
    expect(networkLane?.routeScore).toBeGreaterThan(networkLane?.baseScore || 0);
  });
});
