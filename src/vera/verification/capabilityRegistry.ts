/**
 * Vera Capability Registry
 *
 * On startup, enumerate every tool/capability Vera has, build a canonical
 * manifest, hash it, and publish to the registry topic via actionVerifier.
 * Exposes the manifest + proof for inspection.
 *
 * @module vera/verification/capabilityRegistry
 */

import { createHash } from 'crypto';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { ALL_TOOL_DEFINITIONS } from '../../agent/definitions.js';
import { actionVerifier, type VerificationProof } from './actionVerifier.js';

export interface CapabilityManifest {
  version: string;
  generatedAt: number;
  operator: string;
  network: string;
  toolCount: number;
  domains: Record<string, number>; // domain → count
  tools: Array<{ name: string; description: string }>;
  features: {
    hip991: boolean;
    hip993: boolean;
    actionVerification: boolean;
    quantumHandshake: boolean;
    mirrorVerify: boolean;
  };
  hash: string;
}

class CapabilityRegistry {
  private manifest: CapabilityManifest | null = null;
  private proof: VerificationProof | null = null;
  private published = false;

  /**
   * Build the manifest (pure, no network calls).
   */
  buildManifest(): CapabilityManifest {
    const tools = ALL_TOOL_DEFINITIONS.map((t) => ({
      name: t.function.name,
      description: t.function.description.substring(0, 200),
    }));

    // Categorize by prefix (hts_, hcs_, evm_, kit_, qvx_, etc.)
    const domains: Record<string, number> = {};
    for (const t of tools) {
      const prefix = t.name.split('_')[0] || 'other';
      domains[prefix] = (domains[prefix] || 0) + 1;
    }

    const bodyForHash = JSON.stringify({ tools, domains });
    const hash = createHash('sha256').update(bodyForHash).digest('hex');

    const manifest: CapabilityManifest = {
      version: '1.0.0',
      generatedAt: Date.now(),
      operator: config.HEDERA_OPERATOR_ACCOUNT_ID ?? 'unknown',
      network: config.HEDERA_NETWORK ?? 'mainnet',
      toolCount: tools.length,
      domains,
      tools,
      features: {
        hip991: true,
        hip993: true,
        actionVerification: true,
        quantumHandshake: true,
        mirrorVerify: true,
      },
      hash,
    };

    this.manifest = manifest;
    return manifest;
  }

  /**
   * Publish the manifest to the registry topic via actionVerifier.
   */
  async publish(): Promise<VerificationProof> {
    const manifest = this.manifest ?? this.buildManifest();

    const registryTopic = process.env.VERA_REGISTRY_TOPIC_ID;

    const proof = await actionVerifier.verifyAction({
      domain: 'capability',
      type: 'manifest-publish',
      actor: 'vera-capability-registry',
      payload: {
        version: manifest.version,
        toolCount: manifest.toolCount,
        domains: manifest.domains,
        features: manifest.features,
        manifestHash: manifest.hash,
      },
      topicId: registryTopic,
    });

    this.proof = proof;
    this.published = true;

    logger.info('CapabilityRegistry', {
      message: 'Capability manifest published',
      toolCount: manifest.toolCount,
      hash: manifest.hash,
      topicId: proof.topicId,
      sequenceNumber: proof.sequenceNumber,
    });

    return proof;
  }

  getManifest(): CapabilityManifest | null {
    return this.manifest;
  }

  getProof(): VerificationProof | null {
    return this.proof;
  }

  isPublished(): boolean {
    return this.published;
  }
}

export const capabilityRegistry = new CapabilityRegistry();
