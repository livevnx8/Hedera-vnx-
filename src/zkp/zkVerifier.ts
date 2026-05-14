/**
 * ZK Verifier
 * 
 * Verifies zero-knowledge proofs for private transactions,
 * credentials, and computations on the Hedera network.
 */

import { logger } from '../monitoring/logger.js';
import type { ZKProof, VerificationResult, CompiledCircuit } from './types.js';

interface VerifyOptions {
  maxVerificationTimeMs?: number;
  checkRevocation?: boolean;
}

export class ZKVerifier {
  private verificationCache: Map<string, boolean> = new Map();
  private circuitRegistry: Map<string, CompiledCircuit> = new Map();
  private revocationList: Set<string> = new Set();

  /**
   * Register a compiled circuit for verification
   */
  registerCircuit(name: string, circuit: CompiledCircuit): void {
    this.circuitRegistry.set(name, circuit);
    logger.info('ZKVerifier', {
      message: 'Circuit registered',
      name,
      hash: circuit.circuitHash.slice(0, 16) + '...'
    });
  }

  /**
   * Verify a ZK proof
   */
  async verifyProof(
    proof: ZKProof,
    publicInputs: string[],
    circuitName: string,
    options: VerifyOptions = {}
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(proof, publicInputs);
      const cached = this.verificationCache.get(cacheKey);
      if (cached !== undefined) {
        return {
          valid: cached,
          verificationTimeMs: Date.now() - startTime
        };
      }

      // Get circuit
      const circuit = this.circuitRegistry.get(circuitName);
      if (!circuit) {
        return {
          valid: false,
          error: `Circuit ${circuitName} not registered`,
          verificationTimeMs: Date.now() - startTime
        };
      }

      // Check revocation if enabled
      if (options.checkRevocation) {
        const proofId = this.getProofId(proof);
        if (this.revocationList.has(proofId)) {
          return {
            valid: false,
            error: 'Proof has been revoked',
            verificationTimeMs: Date.now() - startTime
          };
        }
      }

      // Verify proof structure
      if (!this.isValidProofStructure(proof)) {
        return {
          valid: false,
          error: 'Invalid proof structure',
          verificationTimeMs: Date.now() - startTime
        };
      }

      // Verify public inputs match
      if (!this.publicInputsMatch(proof, publicInputs)) {
        return {
          valid: false,
          error: 'Public inputs mismatch',
          verificationTimeMs: Date.now() - startTime
        };
      }

      // Perform verification (mock - would use snarkjs in production)
      const isValid = await this.performVerification(proof, circuit);

      // Cache result
      this.verificationCache.set(cacheKey, isValid);

      const result: VerificationResult = {
        valid: isValid,
        verificationTimeMs: Date.now() - startTime
      };

      logger.debug('ZKVerifier', {
        message: 'Proof verified',
        circuit: circuitName,
        valid: isValid,
        timeMs: result.verificationTimeMs
      });

      return result;

    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        verificationTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Batch verify multiple proofs
   */
  async batchVerify(
    proofs: Array<{ proof: ZKProof; publicInputs: string[]; circuitName: string }>
  ): Promise<VerificationResult[]> {
    // Parallel verification
    const results = await Promise.all(
      proofs.map(p => this.verifyProof(p.proof, p.publicInputs, p.circuitName))
    );

    logger.info('ZKVerifier', {
      message: 'Batch verification complete',
      total: proofs.length,
      valid: results.filter(r => r.valid).length
    });

    return results;
  }

  /**
   * Revoke a proof (for credential revocation)
   */
  revokeProof(proof: ZKProof): void {
    const proofId = this.getProofId(proof);
    this.revocationList.add(proofId);
    
    // Invalidate cache entries
    for (const [key, _] of this.verificationCache) {
      if (key.includes(proofId)) {
        this.verificationCache.delete(key);
      }
    }

    logger.info('ZKVerifier', {
      message: 'Proof revoked',
      proofId: proofId.slice(0, 16) + '...'
    });
  }

  /**
   * Check if a proof is revoked
   */
  isRevoked(proof: ZKProof): boolean {
    const proofId = this.getProofId(proof);
    return this.revocationList.has(proofId);
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verificationCache.clear();
    logger.info('ZKVerifier', { message: 'Verification cache cleared' });
  }

  /**
   * Get verifier statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      registeredCircuits: this.circuitRegistry.size,
      cacheSize: this.verificationCache.size,
      revokedProofs: this.revocationList.size,
      circuitNames: Array.from(this.circuitRegistry.keys())
    };
  }

  /**
   * Perform actual verification (mock implementation)
   */
  private async performVerification(proof: ZKProof, circuit: CompiledCircuit): Promise<boolean> {
    // Simulate verification time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Mock verification logic
    const proofHash = this.hashProof(proof);
    const circuitHash = circuit.circuitHash;
    
    // In production, this would use snarkjs.groth16.verify
    return proofHash.length > 0 && circuitHash.length > 0;
  }

  /**
   * Check if proof has valid structure
   */
  private isValidProofStructure(proof: ZKProof): boolean {
    return !!(
      proof.pi_a &&
      proof.pi_b &&
      proof.pi_c &&
      proof.publicSignals &&
      proof.pi_a.length === 3 &&
      proof.pi_b.length === 2 &&
      proof.pi_c.length === 2
    );
  }

  /**
   * Check if public inputs match proof
   */
  private publicInputsMatch(proof: ZKProof, expectedInputs: string[]): boolean {
    // Simplified check - would do proper comparison in production
    return proof.publicSignals.length === expectedInputs.length;
  }

  /**
   * Generate cache key for proof
   */
  private getCacheKey(proof: ZKProof, publicInputs: string[]): string {
    const proofData = JSON.stringify({
      a: proof.pi_a,
      b: proof.pi_b,
      c: proof.pi_c,
      public: publicInputs
    });
    return Buffer.from(proofData).toString('base64').slice(0, 64);
  }

  /**
   * Get unique proof ID
   */
  private getProofId(proof: ZKProof): string {
    const data = `${proof.pi_a.join(',')}${proof.pi_c.join(',')}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Hash proof for verification
   */
  private hashProof(proof: ZKProof): string {
    return Buffer.from(JSON.stringify(proof)).toString('base64');
  }
}

// Singleton
let verifierInstance: ZKVerifier | null = null;

export function getZKVerifier(): ZKVerifier {
  if (!verifierInstance) {
    verifierInstance = new ZKVerifier();
  }
  return verifierInstance;
}
