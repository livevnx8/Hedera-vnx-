#!/usr/bin/env node
/**
 * Vera Starlit API Server
 * RESTful API and WebSocket interface for AI interactions
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { VeraStarlit } from '../agents/vera-starlit.mjs';
import { FalconSignature } from '../agents/vera-qvx-falcon-handshake.mjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize Starlit
const starlit = new VeraStarlit();
let falcon;

// Middleware
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    agent: 'vera-starlit',
    version: '4.0.0',
    timestamp: Date.now()
  });
});

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }
    
    const response = await starlit.processInput(message, sessionId);
    
    res.json({
      response: response.text,
      action: response.action,
      intent: response.intent,
      falconSignature: response._falcon,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get swarm status
app.get('/api/swarm/status', async (req, res) => {
  const status = {
    totalAgents: starlit.getTotalAgentCount(),
    agentTypes: Array.from(starlit.agentRegistry.entries()).map(([type, info]) => ({
      type,
      count: info.count,
      capabilities: info.capabilities
    })),
    timestamp: Date.now()
  };
  
  // Sign with Falcon
  const sig = await falcon.sign(status, (await falcon.generateKeypair('api-server')).privateKey);
  
  res.json({
    ...status,
    _falcon: sig
  });
});

// Bridge status
app.get('/api/bridge/status', async (req, res) => {
  res.json({
    supportedChains: ['hedera', 'ethereum', 'polygon', 'arbitrum'],
    validators: 3,
    feeBps: 25,
    status: 'operational',
    timestamp: Date.now()
  });
});

// Initiate bridge transfer
app.post('/api/bridge/transfer', async (req, res) => {
  const { sourceChain, targetChain, amount, token, recipient } = req.body;
  
  // Simulate transfer initiation
  const transferId = `xfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  res.json({
    transferId,
    status: 'INITIATED',
    sourceChain,
    targetChain,
    amount,
    token,
    fee: amount * 0.0025,
    estimatedTime: '2-3 minutes',
    timestamp: Date.now()
  });
});

// Get conversation history
app.get('/api/chat/:sessionId/history', async (req, res) => {
  const { sessionId } = req.params;
  const conversation = starlit.conversations.get(sessionId);
  
  if (!conversation) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    sessionId,
    history: conversation.history,
    startedAt: conversation.startedAt,
    messageCount: conversation.history.length
  });
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  
  const sessionId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  ws.on('message', async (data) => {
    try {
      const { message } = JSON.parse(data);
      const response = await starlit.processInput(message, sessionId);
      
      ws.send(JSON.stringify({
        type: 'response',
        sessionId,
        ...response,
        timestamp: Date.now()
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
  });
  
  // Send welcome
  ws.send(JSON.stringify({
    type: 'connected',
    sessionId,
    message: 'Connected to Vera Starlit. Send a message to begin.',
    timestamp: Date.now()
  }));
});

// Start server
async function startServer() {
  await starlit.initialize();
  falcon = new FalconSignature();
  await falcon.initialize();
  
  const PORT = process.env.STARLIT_PORT || 3456;
  
  server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ✨ VERA STARLIT API SERVER                                    ║
║  Running on port ${PORT.toString().padEnd(45)} ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /health              - Health check                   ║
║    POST /api/chat            - AI chat                        ║
║    GET  /api/swarm/status    - Swarm status                   ║
║    GET  /api/bridge/status   - Bridge status                 ║
║    POST /api/bridge/transfer - Initiate transfer             ║
║    WS   /                    - WebSocket chat               ║
╠═══════════════════════════════════════════════════════════════╣
║  WebSocket: ws://localhost:${PORT}                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);
