import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runAgentStream } from './dist/agent/runner.js';
import { config } from './dist/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// CORS for all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// API Routes
app.get('/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ 
    status: 'ok', 
    modelProvider: config.MODEL_PROVIDER || 'openai',
    network: config.HEDERA_NETWORK || 'mainnet',
    aiName: config.AI_NAME || 'Vera',
    timestamp: Date.now() 
  });
});

// Real AI chat endpoint with streaming - Grok-like experience
app.post('/v1/chat/agent', async (req, res) => {
  const { messages, stream: requestStream, planner_mode } = req.body;
  
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Convert messages to agent format
  const agentMessages = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  try {
    if (requestStream) {
      // Streaming response - for real-time feel like Grok
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = runAgentStream({
        messages: agentMessages,
        enableTools: true,
        plannerMode: planner_mode || false
      });

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      let fullText = '';
      const stream = runAgentStream({
        messages: agentMessages,
        enableTools: true,
        plannerMode: planner_mode || false
      });

      for await (const event of stream) {
        if (event.type === 'text') {
          fullText += event.content;
        }
      }

      res.json({ content: fullText });
    }
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat processing failed', 
      message: error.message 
    });
  }
});

app.get('/v1/vera/info', (req, res) => {
  res.json({ 
    configured: true, 
    accountId: config.HEDERA_ACCOUNT_ID || '0.0.10294360',
    network: config.HEDERA_NETWORK || 'mainnet',
    modelProvider: config.MODEL_PROVIDER || 'openai',
    aiName: config.AI_NAME || 'Vera',
    capabilities: [
      'hedera_token_service',
      'hedera_consensus_service', 
      'smart_contracts',
      'web_search',
      'real_time_prices',
      'multi_agent_planning',
      'image_generation'
    ]
  });
});

app.get('/wallet/overview', (req, res) => {
  res.json({
    account: {
      id: config.HEDERA_ACCOUNT_ID || '0.0.10294360',
      balance: { hbars: '1250.50' }
    },
    network: config.HEDERA_NETWORK || 'mainnet',
    tokens: [
      { tokenId: '0.0.3716059', symbol: 'DOVU', name: 'DOVU Carbon', balance: 6880000000, decimals: 8 },
      { tokenId: '0.0.0', symbol: 'HBAR', name: 'Hedera', balance: 125050000000, decimals: 8 }
    ]
  });
});

app.get('/wallet/transactions', (req, res) => {
  res.json({
    transactions: [
      { type: 'DOVU Verification', amount: '+1000.00 DOVU', consensusTimestamp: Date.now() / 1000 - 120, result: 'SUCCESS', hashscan: 'https://hashscan.io/mainnet/transaction/0.0.12345@1234567890' },
      { type: 'HCS Log', amount: '-0.001 HBAR', consensusTimestamp: Date.now() / 1000 - 300, result: 'SUCCESS', hashscan: 'https://hashscan.io/mainnet/transaction/0.0.12345@1234567891' }
    ]
  });
});

app.post('/v1/vera/fund', (req, res) => res.json({ success: true, txId: '0.0.12345@1234567890' }));
app.post('/wallet/send/hbar', (req, res) => res.json({ success: true, txId: '0.0.12345@1234567891' }));
app.post('/wallet/send/token', (req, res) => res.json({ success: true, txId: '0.0.12345@1234567892' }));
app.post('/wallet/associate', (req, res) => res.json({ success: true, txId: '0.0.12345@1234567893' }));
app.post('/v1/tx/approve/:txId', (req, res) => res.json({ success: true }));
app.delete('/v1/tx/reject/:txId', (req, res) => res.json({ success: true }));
app.post('/v1/image/start', (req, res) => res.json({ jobId: 'img-123', status: 'pending' }));
app.get('/v1/image/poll/:jobId', (req, res) => res.json({ 
  status: 'done', 
  url: 'https://via.placeholder.com/512x512/7c3aed/ffffff?text=Vera+Generated' 
}));

// Static files
app.use(express.static(join(__dirname, 'public')));

// SPA fallback
app.get('/{*any}', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.CHAT_PORT || 3000;
app.listen(PORT, () => {
  console.log(`🧠 Vera Chat Server running on http://localhost:${PORT}`);
  console.log(`   AI: ${config.AI_NAME || 'Vera'} (${config.MODEL_PROVIDER || 'openai'})`);
  console.log(`   Network: ${config.HEDERA_NETWORK || 'mainnet'}`);
  console.log(`   Mode: Superior Grok-like Experience™`);
});
