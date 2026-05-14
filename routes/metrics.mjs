import { getVeraMetrics } from '../observability/metrics.js';

/**
 * Metrics Collection Middleware
 * 
 * Collects and exposes Prometheus-compatible metrics
 */

export function metricsMiddleware(app) {
  app.get('/metrics', async (req, res) => {
    try {
      const metrics = getVeraMetrics();
      const output = metrics.getMetrics();
      
      res.set('Content-Type', 'text/plain');
      res.send(output);
    } catch (error) {
      res.status(500).send(`Error collecting metrics: ${error.message}`);
    }
  });
}
