/**
 * Dovu API Routes
 * REST API endpoints for Dovu integration
 */

import { Router, type Request, type Response } from 'express';
import { dovuAdapter, verificationEngine, notaryService, paymentOrchestrator } from '../dovu/index.js';
import { logger } from '../monitoring/logger.js';

const router = Router();

// Initialize Dovu components on first request
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await dovuAdapter.initialize();
    await notaryService.initialize();
    await paymentOrchestrator.initialize();
    initialized = true;
  }
}

/**
 * POST /dovu/verify
 * Verify Dovu data with specified depth
 */
router.post('/verify', async (req, res) => {
  try {
    await ensureInitialized();
    
    const { data_id, verification_depth = 'standard' } = req.body;
    
    if (!data_id) {
      return res.status(400).json({ error: 'Missing data_id parameter' });
    }

    // Fetch data from Dovu
    const payload = await dovuAdapter.fetchDovuData(data_id);
    if (!payload) {
      return res.status(404).json({ error: 'Data not found in Dovu OS' });
    }

    // Perform verification
    const result = await verificationEngine.verify(payload, verification_depth);

    // Notarize if verification passed
    let notarization = null;
    if (result.verified) {
      notarization = await notaryService.notarize(payload, result);
      
      // Create payment request
      if (notarization) {
        await paymentOrchestrator.createPaymentRequest(
          notarization.id,
          verification_depth,
          1
        );
      }
    }

    res.json({
      success: true,
      data: {
        data_id,
        verified: result.verified,
        confidence: result.confidence,
        risk_score: result.riskScore,
        verification_depth: result.verificationDepth,
        notarization_id: notarization?.id || null,
        hcs_sequence: notarization?.hcsSequenceNumber || null,
        checks: result.checks,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Verification failed' });
    res.status(500).json({ error: 'Verification failed', details: String(error) });
  }
});

/**
 * POST /dovu/attest
 * Submit attestation for verified data
 */
router.post('/attest', async (req, res) => {
  try {
    await ensureInitialized();
    
    const { data_id, verification_hash, verified } = req.body;
    
    if (!data_id || !verification_hash) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const payload = await dovuAdapter.fetchDovuData(data_id);
    if (!payload) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const result = {
      verified,
      confidence: 1.0,
      checks: { accountValid: true, signatureValid: true, dataHashValid: true, timestampValid: true },
      verificationHash: verification_hash,
      timestamp: Date.now(),
      errors: [],
      riskScore: 0,
      verificationDepth: 'standard',
      crossReferences: { mirrorNodeMatch: true, hcsMessagesFound: 0, similarDataPoints: 0 },
      metadata: { verificationDuration: 0, checksPerformed: 4, dataQuality: 100 },
    };

    const notarization = await notaryService.notarize(payload, result);

    if (!notarization) {
      return res.status(500).json({ error: 'Failed to create notarization' });
    }

    res.json({
      success: true,
      data: {
        notarization_id: notarization.id,
        hcs_topic_id: notarization.hcsTopicId,
        hcs_sequence_number: notarization.hcsSequenceNumber,
        attestation_hash: notarization.attestationHash,
        timestamp: notarization.timestamp,
      },
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Attestation failed' });
    res.status(500).json({ error: 'Attestation failed', details: String(error) });
  }
});

/**
 * POST /dovu/payment/claim
 * Claim payment for verification work
 */
router.post('/payment/claim', async (req, res) => {
  try {
    await ensureInitialized();
    
    const { notarization_id, payment_type = 'smart_contract' } = req.body;
    
    if (!notarization_id) {
      return res.status(400).json({ error: 'Missing notarization_id' });
    }

    const success = payment_type === 'smart_contract'
      ? await paymentOrchestrator.processSmartContractPayment(notarization_id)
      : await paymentOrchestrator.processManualPayment(notarization_id);

    if (!success) {
      return res.status(500).json({ error: 'Payment processing failed' });
    }

    res.json({
      success: true,
      data: {
        notarization_id,
        payment_type,
        status: 'completed',
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Payment claim failed' });
    res.status(500).json({ error: 'Payment claim failed', details: String(error) });
  }
});

/**
 * POST /dovu/certificate
 * Create completion certificate for batch
 */
router.post('/certificate', async (req, res) => {
  try {
    await ensureInitialized();
    
    const { project_name, description = '', notarization_ids } = req.body;
    
    if (!project_name || !notarization_ids || !Array.isArray(notarization_ids)) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const certificate = await notaryService.createCertificate(
      project_name,
      description,
      notarization_ids
    );

    if (!certificate) {
      return res.status(500).json({ error: 'Failed to create certificate' });
    }

    res.json({
      success: true,
      data: {
        certificate_id: certificate.id,
        project_name: certificate.projectName,
        hcs_topic_id: certificate.hcsTopicId,
        hcs_sequence_number: certificate.hcsSequenceNumber,
        total_verifications: certificate.totalVerifications,
        successful_verifications: certificate.successfulVerifications,
        total_carbon_tons: certificate.totalCarbonTons,
        timestamp: certificate.timestamp,
      },
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Certificate creation failed' });
    res.status(500).json({ error: 'Certificate creation failed', details: String(error) });
  }
});

/**
 * POST /dovu/stake
 * Stake DOVU tokens
 */
router.post('/stake', async (req, res) => {
  try {
    await ensureInitialized();
    
    const { amount, lock_period_days = 30 } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const position = await paymentOrchestrator.createStakingPosition(amount, lock_period_days);

    if (!position) {
      return res.status(500).json({ error: 'Failed to create staking position' });
    }

    res.json({
      success: true,
      data: {
        position_id: position.id,
        staked_amount: position.stakedAmount,
        lock_period_days: position.lockPeriodDays,
        status: position.status,
        staked_at: position.stakedAt,
      },
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Staking failed' });
    res.status(500).json({ error: 'Staking failed', details: String(error) });
  }
});

/**
 * GET /dovu/stats
 * Get Vera's Dovu verification statistics
 */
router.get('/stats', async (req, res) => {
  try {
    await ensureInitialized();
    
    const stats = paymentOrchestrator.getPaymentStats();
    const topicIds = notaryService.getTopicIds();

    res.json({
      success: true,
      data: {
        ...stats,
        hcs_topics: topicIds,
        dovu_token_id: '0.0.1329002',
      },
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Failed to get stats' });
    res.status(500).json({ error: 'Failed to get stats', details: String(error) });
  }
});

/**
 * GET /dovu/notarization/:id
 * Get notarization details
 */
router.get('/notarization/:id', async (req, res) => {
  try {
    const notarization = notaryService.getNotarization(req.params.id);
    
    if (!notarization) {
      return res.status(404).json({ error: 'Notarization not found' });
    }

    res.json({
      success: true,
      data: notarization,
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Failed to get notarization' });
    res.status(500).json({ error: 'Failed to get notarization', details: String(error) });
  }
});

/**
 * GET /dovu/certificate/:id
 * Get certificate details
 */
router.get('/certificate/:id', async (req, res) => {
  try {
    const certificate = notaryService.getCertificate(req.params.id);
    
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    logger.error('DovuAPI', { error, message: 'Failed to get certificate' });
    res.status(500).json({ error: 'Failed to get certificate', details: String(error) });
  }
});

export default router;
