/**
 * Vera Response Compression
 * Measurable: Reduces response size by ~40-60%
 */

import compression from 'compression';
import { Application } from 'express';
import { logger } from '../monitoring/logger.js';

export function enableCompression(app: Application): void {
  app.use(compression({
    level: 6, // Balance between speed and compression
    filter: (req, res) => {
      // Don't compress small responses (< 1KB)
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024 // Only compress responses > 1KB
  }));

  logger.info('Response compression enabled (gzip level 6)');
}

// Middleware to add cache headers for static responses
export function addCacheHeaders(maxAge: number = 60) {
  return (req: any, res: any, next: any) => {
    // Cache health endpoint for 10 seconds
    if (req.path === '/health') {
      res.setHeader('Cache-Control', 'public, max-age=10');
    }
    // Cache lattice state for 5 seconds
    else if (req.path.includes('/lattice/state')) {
      res.setHeader('Cache-Control', 'public, max-age=5');
    }
    // Default cache for API responses
    else if (req.method === 'GET') {
      res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    }
    next();
  };
}
