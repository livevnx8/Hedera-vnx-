#!/usr/bin/env node
/**
 * Simple API Server - Standalone version
 */

import http from 'http';
import { readFileSync, existsSync } from 'fs';

const PORT = 8080;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  try {
    switch (url.pathname) {
      case '/health':
        res.end(JSON.stringify({
          status: 'healthy',
          version: '6.0.0',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          network: 'mainnet'
        }, null, 2));
        break;
        
      case '/agents':
        const agents = [
          { name: 'energy-auditor', domain: 'energy', topic: '0.0.10412579' },
          { name: 'defi-analyst', domain: 'defi', topic: '0.0.10412577' },
          { name: 'security-guardian', domain: 'security', topic: '0.0.10409351' },
          { name: 'carbon-validator', domain: 'carbon', topic: '0.0.10412579' }
        ].map(a => {
          try {
            const log = readFileSync(`./logs/${a.name}.log`, 'utf8');
            const cycles = (log.match(/CYCLE #/g) || []).length;
            const errors = (log.match(/❌|Error/g) || []).length;
            const ml = (log.match(/ML Forecast|Prediction/g) || []).length;
            return { ...a, status: 'running', cycles, errors, ml };
          } catch (e) {
            return { ...a, status: 'stopped', cycles: 0, errors: 0, ml: 0 };
          }
        });
        res.end(JSON.stringify({ agents, total: agents.length }, null, 2));
        break;
        
      case '/topics':
        res.end(JSON.stringify({
          network: 'mainnet',
          topics: {
            CORE: { id: '0.0.10409351', url: 'https://hashscan.io/mainnet/topic/0.0.10409351' },
            DEFI: { id: '0.0.10412577', url: 'https://hashscan.io/mainnet/topic/0.0.10412577' },
            ENERGY: { id: '0.0.10412579', url: 'https://hashscan.io/mainnet/topic/0.0.10412579' },
            BRIDGE: { id: '0.0.10412578', url: 'https://hashscan.io/mainnet/topic/0.0.10412578' }
          }
        }, null, 2));
        break;
        
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }, null, 2));
    }
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }, null, 2));
  }
});

server.listen(PORT, () => {
  console.log(`✅ API Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
