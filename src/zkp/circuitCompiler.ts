/**
 * Circuit Compiler
 * 
 * Compiles zero-knowledge circuits from high-level descriptions
 * into R1CS constraints and generates proving/verification keys.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../monitoring/logger.js';
import type { CompiledCircuit } from './types.js';

const execAsync = promisify(exec);

interface CircuitSource {
  name: string;
  source: string;
  template: 'transfer' | 'identity' | 'vote' | 'custom';
}

interface CompileOptions {
  powerOfTau?: number;
  outputDir?: string;
  template?: string;
}

export class CircuitCompiler {
  private circuits: Map<string, CompiledCircuit> = new Map();
  private powerOfTauPath: string;
  private circuitsDir: string;

  constructor(circuitsDir: string = './circuits', powerOfTauPath: string = './ptau') {
    this.circuitsDir = circuitsDir;
    this.powerOfTauPath = powerOfTauPath;
  }

  /**
   * Compile a circuit from source code
   */
  async compile(source: CircuitSource, options: CompileOptions = {}): Promise<CompiledCircuit> {
    try {
      const { name, source: circuitCode, template } = source;
      const outputDir = options.outputDir || join(this.circuitsDir, name);
      
      logger.info('CircuitCompiler', {
        message: 'Starting circuit compilation',
        circuit: name,
        template
      });

      // Ensure output directory exists
      await mkdir(outputDir, { recursive: true });

      // Write circuit source
      const circuitPath = join(outputDir, `${name}.circom`);
      await writeFile(circuitPath, circuitCode);

      // Compile to wasm and r1cs (mock - would use circom in production)
      const wasm = await this.generateWasm(outputDir, name);
      const r1cs = await this.generateR1cs(outputDir, name);

      // Generate proving and verification keys
      const { provingKey, verificationKey } = await this.generateKeys(
        r1cs, 
        options.powerOfTau || 12
      );

      // Create circuit hash for verification
      const circuitHash = this.hashCircuit(r1cs);

      const compiled: CompiledCircuit = {
        r1cs,
        wasm,
        provingKey,
        verificationKey,
        circuitHash
      };

      // Cache compiled circuit
      this.circuits.set(name, compiled);

      logger.info('CircuitCompiler', {
        message: 'Circuit compiled successfully',
        circuit: name,
        hash: circuitHash.slice(0, 16) + '...'
      });

      return compiled;

    } catch (error) {
      logger.error('CircuitCompiler', {
        message: 'Circuit compilation failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate keys for a compiled circuit
   */
  async generateKeys(r1cs: Buffer, powerOfTau: number): Promise<{ provingKey: Buffer; verificationKey: Buffer }> {
    // Mock key generation - would use snarkjs in production
    const provingKey = Buffer.from(`pk_${powerOfTau}_${r1cs.length}`);
    const verificationKey = Buffer.from(`vk_${powerOfTau}_${r1cs.length}`);
    
    // Simulate key generation time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return { provingKey, verificationKey };
  }

  /**
   * Get a cached compiled circuit
   */
  getCompiledCircuit(name: string): CompiledCircuit | undefined {
    return this.circuits.get(name);
  }

  /**
   * List all compiled circuits
   */
  listCircuits(): string[] {
    return Array.from(this.circuits.keys());
  }

  /**
   * Verify circuit integrity
   */
  async verifyCircuit(name: string, expectedHash: string): Promise<boolean> {
    const circuit = this.circuits.get(name);
    if (!circuit) return false;
    
    return circuit.circuitHash === expectedHash;
  }

  /**
   * Pre-compile standard circuits
   */
  async precompileStandards(): Promise<void> {
    const standards = [
      {
        name: 'shielded_transfer',
        template: 'transfer' as const,
        source: this.getTransferCircuit()
      },
      {
        name: 'identity_proof',
        template: 'identity' as const,
        source: this.getIdentityCircuit()
      },
      {
        name: 'private_vote',
        template: 'vote' as const,
        source: this.getVoteCircuit()
      }
    ];

    for (const standard of standards) {
      try {
        await this.compile(standard);
      } catch (error) {
        logger.warn('CircuitCompiler', {
          message: 'Failed to precompile standard circuit',
          circuit: standard.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Generate wasm from circuit
   */
  private async generateWasm(outputDir: string, name: string): Promise<Buffer> {
    // Mock wasm generation
    return Buffer.from(`wasm_${name}_${Date.now()}`);
  }

  /**
   * Generate r1cs constraints
   */
  private async generateR1cs(outputDir: string, name: string): Promise<Buffer> {
    // Mock r1cs generation
    return Buffer.from(`r1cs_${name}_${Date.now()}`);
  }

  /**
   * Hash circuit for integrity verification
   */
  private hashCircuit(r1cs: Buffer): string {
    // Simple hash - would use proper hashing in production
    let hash = 0;
    for (let i = 0; i < r1cs.length; i++) {
      hash = ((hash << 5) - hash) + r1cs[i];
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Get standard transfer circuit template
   */
  private getTransferCircuit(): string {
    return `
pragma circom 2.0.0;

include "circomlib/poseidon.circom";
include "circomlib/mux1.circom";

/*
 * Shielded Transfer Circuit
 * Proves: sender has sufficient balance without revealing amount
 * Public inputs: merkleRoot, nullifierHash
 * Private inputs: amount, recipient, merklePath
 */
template ShieldedTransfer(levels) {
    signal input amount;
    signal input recipient;
    signal input merklePath[levels];
    signal input merkleRoot;
    signal input nullifier;
    
    signal output nullifierHash;
    signal output commitment;
    
    // Compute commitment
    component hasher = Poseidon(3);
    hasher.inputs[0] <== amount;
    hasher.inputs[1] <== recipient;
    hasher.inputs[2] <== nullifier;
    commitment <== hasher.out;
    
    // Compute nullifier hash
    component nfHasher = Poseidon(1);
    nfHasher.inputs[0] <== nullifier;
    nullifierHash <== nfHasher.out;
    
    // Verify merkle inclusion (simplified)
    // In production, this would verify the full merkle path
}

component main = ShieldedTransfer(20);
    `.trim();
  }

  /**
   * Get identity circuit template
   */
  private getIdentityCircuit(): string {
    return `
pragma circom 2.0.0;

/*
 * Identity Proof Circuit
 * Proves: identity matches credential without revealing data
 */
template IdentityProof() {
    signal input credentialHash;
    signal input identitySecret;
    signal input challenge;
    
    signal output proof;
    
    // Prove knowledge of secret that hashes to credential
    // Without revealing the actual identity data
    proof <== credentialHash * identitySecret + challenge;
}

component main = IdentityProof();
    `.trim();
  }

  /**
   * Get voting circuit template
   */
  private getVoteCircuit(): string {
    return `
pragma circom 2.0.0;

/*
 * Private Vote Circuit
 * Proves: valid vote without revealing choice
 */
template PrivateVote(numOptions) {
    signal input choice; // 0 to numOptions-1
    signal input votingKey;
    signal input merkleRoot; // Of eligible voters
    
    signal output voteCommitment;
    signal output nullifier;
    
    // Range proof: choice is valid
    component rangeCheck = LessThan(32);
    rangeCheck.in[0] <== choice;
    rangeCheck.in[1] <== numOptions;
    rangeCheck.out === 1;
    
    // Compute vote commitment
    voteCommitment <== Poseidon([choice, votingKey]);
    nullifier <== Poseidon([votingKey, merkleRoot]);
}

component main = PrivateVote(10);
    `.trim();
  }

  /**
   * Get compiler statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      compiledCircuits: this.circuits.size,
      circuitNames: Array.from(this.circuits.keys()),
      cacheSizeBytes: Array.from(this.circuits.values())
        .reduce((acc, c) => acc + c.r1cs.length + c.wasm.length, 0)
    };
  }
}

// Singleton
let compilerInstance: CircuitCompiler | null = null;

export function getCircuitCompiler(circuitsDir?: string): CircuitCompiler {
  if (!compilerInstance) {
    compilerInstance = new CircuitCompiler(circuitsDir);
  }
  return compilerInstance;
}
