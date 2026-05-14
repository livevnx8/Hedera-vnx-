/**
 * Mock Hedera Mirror Node
 * Simulates mirror node API for offline development
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 8082;

// Config
const SEED_DATA = process.env.SEED_DATA === 'true';
const PRESET = process.env.PRESET || 'development';

// In-memory storage
const accounts = new Map();
const transactions = new Map();
const topics = new Map();
const tokens = new Map();

// Seed data
function seedData() {
  // Sample accounts
  accounts.set('0.0.1001', {
    account: '0.0.1001',
    balance: 1000000000,
    key: { _type: 'ED25519', key: 'aa2...' },
    memo: 'Vera Core Account',
    created_timestamp: Date.now() - 86400000
  });

  accounts.set('0.0.1002', {
    account: '0.0.1002',
    balance: 500000000,
    key: { _type: 'ED25519', key: 'bb3...' },
    memo: 'Carbon Validator',
    created_timestamp: Date.now() - 86400000
  });

  // Sample topics
  topics.set('0.0.2001', {
    topic_id: '0.0.2001',
    memo: 'Vera Core Topic',
    created_timestamp: Date.now() - 86400000,
    messages: []
  });

  // Sample tokens
  tokens.set('0.0.3001', {
    token_id: '0.0.3001',
    name: 'Vera Carbon Token',
    symbol: 'VCT',
    decimals: 8,
    total_supply: '100000000000',
    created_timestamp: Date.now() - 86400000
  });

  console.log('[Mirror Mock] Seed data loaded');
}

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'mirror-mock',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

// Network info
app.get('/api/v1/network/info', (req, res) => {
  res.json({
    name: 'testnet',
    timestamp: new Date().toISOString(),
    release: 'v0.42.0',
    nodes: [
      { node_id: 0, account_id: '0.0.3', host: '127.0.0.1', port: 50211 }
    ]
  });
});

// Accounts
app.get('/api/v1/accounts', (req, res) => {
  const accountId = req.query['account.id'];
  const limit = parseInt(req.query.limit) || 25;
  let results = Array.from(accounts.values());
  
  if (accountId) {
    results = results.filter(a => a.account === accountId);
  }
  
  res.json({
    accounts: results.slice(0, parseInt(limit)),
    links: { next: null }
  });
});

app.get('/api/v1/accounts/:accountId', (req, res) => {
  const { accountId } = req.params;
  const account = accounts.get(accountId);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  res.json(account);
});

app.get('/api/v1/accounts/:accountId/balance', (req, res) => {
  const { accountId } = req.params;
  const account = accounts.get(accountId);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  res.json({
    account: accountId,
    balance: account.balance,
    timestamp: new Date().toISOString()
  });
});

// Transactions
app.get('/api/v1/transactions', (req, res) => {
  const accountId = req.query['account.id'];
  const limit = parseInt(req.query.limit) || 25;
  let results = Array.from(transactions.values());
  
  if (accountId) {
    results = results.filter(t => 
      t.payer_account_id === accountId || 
      t.node === accountId
    );
  }
  
  res.json({
    transactions: results.slice(0, parseInt(limit)),
    links: { next: null }
  });
});

app.get('/api/v1/transactions/:transactionId', (req, res) => {
  const { transactionId } = req.params;
  const tx = transactions.get(transactionId);
  
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  res.json(tx);
});

// Topics
app.get('/api/v1/topics', (req, res) => {
  const { limit = 25 } = req.query;
  const results = Array.from(topics.values()).slice(0, parseInt(limit));
  
  res.json({
    topics: results,
    links: { next: null }
  });
});

app.get('/api/v1/topics/:topicId', (req, res) => {
  const { topicId } = req.params;
  const topic = topics.get(topicId);
  
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found' });
  }
  
  res.json(topic);
});

app.get('/api/v1/topics/:topicId/messages', (req, res) => {
  const { topicId } = req.params;
  const { limit = 25 } = req.query;
  const topic = topics.get(topicId);
  
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found' });
  }
  
  res.json({
    messages: topic.messages.slice(-parseInt(limit)),
    links: { next: null }
  });
});

// Tokens
app.get('/api/v1/tokens', (req, res) => {
  const { limit = 25 } = req.query;
  const results = Array.from(tokens.values()).slice(0, parseInt(limit));
  
  res.json({
    tokens: results,
    links: { next: null }
  });
});

app.get('/api/v1/tokens/:tokenId', (req, res) => {
  const { tokenId } = req.params;
  const token = tokens.get(tokenId);
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json(token);
});

// Submit transaction (mock)
app.post('/api/v1/transactions', (req, res) => {
  const txId = `0.0.${Math.floor(Math.random() * 10000)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  const tx = {
    transaction_id: txId,
    type: req.body.type || 'CRYPTOTRANSFER',
    payer_account_id: req.body.payer || '0.0.1001',
    node: '0.0.3',
    result: 'SUCCESS',
    consensus_timestamp: new Date().toISOString(),
    valid_start_timestamp: new Date().toISOString(),
    charged_tx_fee: 100000
  };
  
  transactions.set(txId, tx);
  
  res.json({
    transaction_id: txId,
    status: 'SUCCESS'
  });
});

// Admin endpoints
app.get('/admin/state', (req, res) => {
  res.json({
    accounts: accounts.size,
    transactions: transactions.size,
    topics: topics.size,
    tokens: tokens.size
  });
});

app.post('/admin/reset', (req, res) => {
  accounts.clear();
  transactions.clear();
  topics.clear();
  tokens.clear();
  
  if (SEED_DATA) {
    seedData();
  }
  
  res.json({ status: 'SUCCESS', message: 'State reset complete' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🔍 Mirror Node Mock Service                                ║
║  Version: 1.0.0 | Port: ${PORT}                             ║
╠════════════════════════════════════════════════════════════╣
║  Features:                                                  ║
║    ✅ REST API compatible with real mirror node            ║
║    ✅ Account queries                                       ║
║    ✅ Transaction history                                   ║
║    ✅ Topic message queries                                 ║
║    ✅ Token queries                                         ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  if (SEED_DATA) {
    seedData();
  }
});
