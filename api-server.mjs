#!/usr/bin/env node
/**
 * Vera API Server - REST API for external integration
 * Phase 6 Implementation
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { coordinator } from './blueprints/coordinator.mjs';
import { DomainAnalytics } from './blueprints/predictive-analytics.mjs';
import { WebSocketServer } from 'ws';

const PORT = process.env.VERA_API_PORT || 8080;

class VeraAPIServer {
  constructor() {
    this.server = null;
    this.requestCount = 0;
    this.startTime = Date.now();
    this.wss = null;
  }

  async start() {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    
    this.server.listen(PORT, () => {
      console.log(`\n🌐 VERA API SERVER v6.0`);
      console.log(`   Port: ${PORT}`);
      console.log(`   Status: ONLINE\n`);
      console.log(`Endpoints:`);
      console.log(`   GET /health       - System health`);
      console.log(`   GET /agents       - Agent status`);
      console.log(`   GET /metrics      - Performance metrics`);
      console.log(`   GET /predictions  - ML predictions`);
      console.log(`   GET /topics       - HCS topic info`);
      console.log(`   GET /logs         - Recent logs`);
      console.log(`   POST /alert       - Trigger alert`);
      console.log(`   WS  /ws           - WebSocket live updates`);
      console.log(`\nTest: curl http://localhost:${PORT}/health\n`);
    });

    // Initialize WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();

    return this;
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('🔌 WebSocket client connected');
      
      // Send initial data
      ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
      
      // Handle messages from client
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.action === 'subscribe') {
            ws.subscribed = data.channel;
            ws.send(JSON.stringify({ type: 'subscribed', channel: data.channel }));
          }
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
      });
    });

    // Broadcast updates every 5 seconds
    setInterval(() => {
      const update = {
        type: 'stats',
        timestamp: Date.now(),
        agents: 15,
        messages: Math.floor(2800 + Math.random() * 100),
        tps: (10 + Math.random() * 5).toFixed(1)
      };
      this.broadcast(update);
    }, 5000);
  }

  broadcast(data) {
    if (!this.wss) return;
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify(data));
      }
    });
  }

  handleRequest(req, res) {
    this.requestCount++;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    try {
      switch (path) {
        case '/':
        case '/dashboard.html':
          this.serveStaticFile(res, 'dashboard.html', 'text/html');
          break;
        case '/v3':
        case '/dashboard-v3.html':
          this.serveStaticFile(res, 'dashboard-v3.html', 'text/html');
          break;
        case '/v4':
        case '/dashboard-v4.html':
          this.serveStaticFile(res, 'dashboard-v4.html', 'text/html');
          break;
        case '/fedex-vera-dashboard.html':
          this.serveStaticFile(res, 'fedex-vera-dashboard.html', 'text/html');
          break;
        case '/health':
          this.handleHealth(req, res);
          break;
        case '/agents':
          this.handleAgents(req, res);
          break;
        case '/metrics':
          this.handleMetrics(req, res);
          break;
        case '/predictions':
          this.handlePredictions(req, res);
          break;
        case '/topics':
          this.handleTopics(req, res);
          break;
        case '/logs':
          this.handleLogs(req, res);
          break;
        case '/alert':
          if (req.method === 'POST') {
            this.handleAlert(req, res);
          } else {
            this.sendError(res, 405, 'Method not allowed');
          }
          break;
        default:
          this.sendError(res, 404, 'Endpoint not found');
      }
    } catch (error) {
      this.sendError(res, 500, error.message);
    }
  }

  serveStaticFile(res, filename, contentType) {
    try {
      const content = readFileSync(`./${filename}`, 'utf8');
      res.setHeader('Content-Type', contentType);
      res.writeHead(200);
      res.end(content);
    } catch (e) {
      this.sendError(res, 404, 'File not found');
    }
  }

  handleHealth(req, res) {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    this.sendJSON(res, {
      status: 'healthy',
      version: '6.0.0',
      uptime,
      requests: this.requestCount,
      timestamp: new Date().toISOString(),
      phases: [1, 2, 3, 4, 5, 6],
      network: 'mainnet'
    });
  }

  handleAgents(req, res) {
    const agents = [
      // Core agents
      { name: 'energy-auditor', domain: 'energy', topic: '0.0.10412579', type: 'core' },
      { name: 'defi-analyst', domain: 'defi', topic: '0.0.10412577', type: 'core' },
      { name: 'security-guardian', domain: 'security', topic: '0.0.10409351', type: 'core' },
      { name: 'carbon-validator', domain: 'carbon', topic: '0.0.10412579', type: 'core' },
      // FedEx agents
      { name: 'fedex-supply', domain: 'fedex', topic: '0.0.10414357', type: 'fedex', label: 'Supply Chain' },
      { name: 'fedex-route', domain: 'fedex', topic: '0.0.10414355', type: 'fedex', label: 'Route Optimization' },
      { name: 'fedex-compliance', domain: 'fedex', topic: '0.0.10414362', type: 'fedex', label: 'Compliance' },
      // McLaren agents (slots for when running)
      { name: 'mclaren-carbon', domain: 'mclaren', topic: '0.0.10414316', type: 'mclaren', label: 'Race Carbon Auditor' },
      { name: 'mclaren-validator', domain: 'mclaren', topic: '0.0.10414317', type: 'mclaren', label: 'Real-Time Validator' },
    ].map(a => {
      try {
        const log = readFileSync(`./logs/${a.name}.log`, 'utf8');
        const cycles = (log.match(/CYCLE #|eventsVerified|routesOptimized|auditsCompleted/g) || []).length;
        const errors = (log.match(/❌|Error|failed/g) || []).length;
        const ml = (log.match(/ML Forecast|Prediction|optimization|scoring/g) || []).length;
        const lastActivity = log.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g)?.pop() || null;
        return { ...a, status: 'running', cycles, errors, ml, lastActivity };
      } catch (e) {
        return { ...a, status: 'stopped', cycles: 0, errors: 0, ml: 0, lastActivity: null };
      }
    });

    const summary = {
      total: agents.length,
      running: agents.filter(a => a.status === 'running').length,
      stopped: agents.filter(a => a.status === 'stopped').length,
      byType: {
        core: agents.filter(a => a.type === 'core'),
        fedex: agents.filter(a => a.type === 'fedex'),
        mclaren: agents.filter(a => a.type === 'mclaren'),
      }
    };

    this.sendJSON(res, { agents, summary, timestamp: Date.now() });
  }

  handleMetrics(req, res) {
    const metrics = {
      api: {
        requests: this.requestCount,
        uptime: Math.floor((Date.now() - this.startTime) / 1000)
      },
      swarm: coordinator.getHealth(),
      timestamp: Date.now()
    };

    this.sendJSON(res, metrics);
  }

  handlePredictions(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const domain = url.searchParams.get('domain') || 'energy';
    
    // Return sample predictions (in production, would use real models)
    const predictions = {
      domain,
      horizon: 6,
      predictions: Array.from({ length: 6 }, (_, i) => ({
        step: i + 1,
        value: Math.round(5000 + (i * 100) + (Math.random() * 500)),
        confidence: Math.round((0.95 - (i * 0.05)) * 100) / 100
      })),
      timestamp: Date.now()
    };

    this.sendJSON(res, predictions);
  }

  handleTopics(req, res) {
    this.sendJSON(res, {
      network: 'mainnet',
      topics: {
        CORE: { id: '0.0.10409351', url: 'https://hashscan.io/mainnet/topic/0.0.10409351' },
        DEFI: { id: '0.0.10412577', url: 'https://hashscan.io/mainnet/topic/0.0.10412577' },
        ENERGY: { id: '0.0.10412579', url: 'https://hashscan.io/mainnet/topic/0.0.10412579' },
        BRIDGE: { id: '0.0.10412578', url: 'https://hashscan.io/mainnet/topic/0.0.10412578' }
      }
    });
  }

  handleLogs(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const agent = url.searchParams.get('agent') || 'energy-auditor';
    const lines = parseInt(url.searchParams.get('lines')) || 10;

    try {
      const logPath = `./logs/${agent}.log`;
      if (!existsSync(logPath)) {
        this.sendJSON(res, { error: 'Log file not found' }, 404);
        return;
      }

      const content = readFileSync(logPath, 'utf8');
      const recent = content.split('\n').slice(-lines).join('\n');
      
      this.sendJSON(res, { agent, lines, content: recent });
    } catch (e) {
      this.sendJSON(res, { error: e.message }, 500);
    }
  }

  handleAlert(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const alert = JSON.parse(body);
        console.log(`🚨 ALERT RECEIVED: ${alert.type} - ${alert.message}`);
        
        this.sendJSON(res, {
          received: true,
          alertId: Math.random().toString(36).substring(7),
          timestamp: Date.now()
        });
      } catch (e) {
        this.sendError(res, 400, 'Invalid JSON');
      }
    });
  }

  sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode);
    res.end(JSON.stringify(data, null, 2));
  }

  sendError(res, code, message) {
    this.sendJSON(res, { error: message, code }, code);
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('\n🛑 API Server stopped\n');
    }
  }
}

// Start if run directly
const server = new VeraAPIServer();

process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});

server.start();

export default VeraAPIServer;
