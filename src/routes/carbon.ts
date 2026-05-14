/**
 * Carbon Credit & Power Grid API Routes
 * 
 * Full end-to-end integration for:
 * - Carbon credit validation
 * - WV Power Grid monitoring
 * - Batch processing
 * - Real-time alerts
 */

import { Router } from 'express';
import { carbonValidationEngine, CarbonCreditData } from '../carbon/validationEngine.js';
import { wvPowerGridMonitor, CarbonCreditBatch } from '../carbon/wvPowerGridMonitor.js';
import { hcsDomainLogger } from '../vera/logging/hcsDomainLogger.js';
import { logger } from '../monitoring/logger.js';

const router = Router();

// ============================================================================
// Carbon Credit Validation
// ============================================================================

/**
 * POST /carbon/validate
 * Validate a single carbon credit
 */
router.post('/validate', async (req, res) => {
  try {
    const credit: CarbonCreditData = req.body;
    
    if (!credit.id || !credit.projectId) {
      return res.status(400).json({
        error: 'Missing required fields: id, projectId'
      });
    }

    const depth = req.query.depth as ('basic' | 'standard' | 'deep') || 'standard';
    const result = await carbonValidationEngine.validate(credit, depth);

    // Log to HCS
    await hcsDomainLogger.logEvent('carbonVerificationTopicId', {
      type: 'API_VALIDATION_REQUEST',
      creditId: credit.id,
      depth,
      result: result.valid,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Validation failed' });
    res.status(500).json({
      error: 'Validation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /carbon/validate-batch
 * Validate multiple carbon credits
 */
router.post('/validate-batch', async (req, res) => {
  try {
    const { credits }: { credits: CarbonCreditData[] } = req.body;
    
    if (!Array.isArray(credits) || credits.length === 0) {
      return res.status(400).json({
        error: 'Request must include array of credits'
      });
    }

    const depth = req.query.depth as ('basic' | 'standard' | 'deep') || 'standard';
    
    // Validate all credits
    const results = await Promise.all(
      credits.map(credit => carbonValidationEngine.validate(credit, depth))
    );

    const summary = {
      total: credits.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      averageRiskScore: results.reduce((sum, r) => sum + r.riskScore, 0) / results.length
    };

    res.json({
      success: true,
      data: {
        summary,
        results: results.map((r, i) => ({
          creditId: credits[i].id,
          ...r
        }))
      }
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Batch validation failed' });
    res.status(500).json({
      error: 'Batch validation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WV Power Grid
// ============================================================================

/**
 * GET /carbon/wv-grid/status
 * Get WV power grid monitor status
 */
router.get('/wv-grid/status', async (req, res) => {
  try {
    const stats = wvPowerGridMonitor.getStats();
    const state = wvPowerGridMonitor.getState();
    
    res.json({
      success: true,
      data: {
        ...stats,
        lastUpdate: state.lastUpdate,
        todayGeneration: state.todayGeneration
      }
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Failed to get grid status' });
    res.status(500).json({
      error: 'Failed to get grid status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /carbon/wv-grid/start
 * Start WV power grid monitoring
 */
router.post('/wv-grid/start', async (req, res) => {
  try {
    await wvPowerGridMonitor.start();
    
    res.json({
      success: true,
      message: 'WV Power Grid monitoring started'
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Failed to start grid monitoring' });
    res.status(500).json({
      error: 'Failed to start grid monitoring',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /carbon/wv-grid/stop
 * Stop WV power grid monitoring
 */
router.post('/wv-grid/stop', async (req, res) => {
  try {
    wvPowerGridMonitor.stop();
    
    res.json({
      success: true,
      message: 'WV Power Grid monitoring stopped'
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Failed to stop grid monitoring' });
    res.status(500).json({
      error: 'Failed to stop grid monitoring',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /carbon/wv-grid/alerts
 * Get grid alerts
 */
router.get('/wv-grid/alerts', async (req, res) => {
  try {
    const unresolvedOnly = req.query.unresolved === 'true';
    const alerts = wvPowerGridMonitor.getAlerts(unresolvedOnly);
    
    res.json({
      success: true,
      data: {
        count: alerts.length,
        alerts
      }
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Failed to get alerts' });
    res.status(500).json({
      error: 'Failed to get alerts',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /carbon/wv-grid/submit-batch
 * Submit credit batch tied to grid generation
 */
router.post('/wv-grid/submit-batch', async (req, res) => {
  try {
    const batch: CarbonCreditBatch = req.body;
    
    if (!batch.batchId || !Array.isArray(batch.credits)) {
      return res.status(400).json({
        error: 'Missing required fields: batchId, credits array'
      });
    }

    const result = await wvPowerGridMonitor.submitCreditBatch(batch);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Failed to submit credit batch' });
    res.status(500).json({
      error: 'Failed to submit credit batch',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// End-to-End Workflows
// ============================================================================

/**
 * POST /carbon/full-validation
 * Full end-to-end: validate credit + grid check + Hedera attestation
 */
router.post('/full-validation', async (req, res) => {
  try {
    const credit: CarbonCreditData = req.body;
    
    if (!credit.id) {
      return res.status(400).json({
        error: 'Missing required field: id'
      });
    }

    const startTime = Date.now();

    // Step 1: Validate credit
    const validationResult = await carbonValidationEngine.validate(credit, 'deep');

    // Step 2: If WV grid credit, verify against grid data
    let gridVerification = null;
    if (credit.powerGridRegion === 'WEST_VA' && credit.generationData) {
      const gridStats = wvPowerGridMonitor.getStats();
      const todayMWh = gridStats.todayGenerationMWh;
      const claimedMWh = credit.generationData.mwhGenerated;
      
      gridVerification = {
        gridTodayMWh: todayMWh,
        claimedMWh: claimedMWh,
        ratio: claimedMWh / todayMWh,
        feasible: claimedMWh <= todayMWh * 1.5 // Allow 50% buffer
      };
    }

    // Step 3: Log to HCS
    await hcsDomainLogger.logEvent('carbonVerificationTopicId', {
      type: 'FULL_VALIDATION_WORKFLOW',
      creditId: credit.id,
      validated: validationResult.valid,
      gridVerified: gridVerification?.feasible ?? null,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      data: {
        creditValidation: validationResult,
        gridVerification,
        overallValid: validationResult.valid && (gridVerification?.feasible ?? true),
        processingTime: Date.now() - startTime
      }
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Full validation failed' });
    res.status(500).json({
      error: 'Full validation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /carbon/stats
 * Get overall carbon module statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const gridStats = wvPowerGridMonitor.getStats();
    const cacheStats = carbonValidationEngine.getCacheStats();
    
    res.json({
      success: true,
      data: {
        gridMonitoring: gridStats,
        validationCache: cacheStats,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    logger.error('CarbonAPI', { error, message: 'Failed to get stats' });
    res.status(500).json({
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
