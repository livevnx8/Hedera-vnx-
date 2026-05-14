/**
 * Mock HCS (Hedera Consensus Service)
 * In-memory simulation for offline development
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 8081;

// Config
const PERSIST = process.env.PERSIST_MESSAGES === 'true';
const RETENTION_HOURS = parseInt(process.env.MESSAGE_RETENTION_HOURS) || 24;

// In-memory storage
const topics = new Map(); // topicId -> { metadata, messages: [] }
const subscriptions = new Map(); // topicId -> Set of callbacks

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'hcs-mock',
    version: '1.0.0',
    topics: topics.size,
    timestamp: Date.now()
  });
});

// Create topic
app.post('/api/v1/topics', (req, res) => {
  const { memo, adminKey, submitKey } = req.body;
  const topicId = `0.0.${1000000 + Math.floor(Math.random() * 9000000)}`;
  
  topics.set(topicId, {
    topicId,
    memo: memo || '',
    adminKey: adminKey || null,
    submitKey: submitKey || null,
    createdAt: Date.now(),
    messages: []
  });
  
  console.log(`[HCS Mock] Created topic: ${topicId}`);
  
  res.json({
    topicId,
    status: 'SUCCESS',
    receipt: {
      topicId,
      status: 'SUCCESS'
    }
  });
});

// Get topic info
app.get('/api/v1/topics/:topicId', (req, res) => {
  const { topicId } = req.params;
  const topic = topics.get(topicId);
  
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found' });
  }
  
  res.json({
    topicId: topic.topicId,
    memo: topic.memo,
    createdAt: topic.createdAt,
    messageCount: topic.messages.length,
    sequenceNumber: topic.messages.length > 0 
      ? topic.messages[topic.messages.length - 1].sequenceNumber 
      : 0
  });
});

// Submit message
app.post('/api/v1/topics/:topicId/messages', (req, res) => {
  const { topicId } = req.params;
  const { message } = req.body;
  
  const topic = topics.get(topicId);
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found' });
  }
  
  const sequenceNumber = topic.messages.length + 1;
  const messageRecord = {
    sequenceNumber,
    contents: Buffer.from(message).toString('base64'),
    runningHash: generateHash(),
    consensusTimestamp: new Date().toISOString(),
    chunkInfo: null
  };
  
  topic.messages.push(messageRecord);
  
  // Notify subscribers
  const subs = subscriptions.get(topicId);
  if (subs) {
    subs.forEach(callback => {
      try {
        callback(messageRecord);
      } catch (e) {
        console.error('[HCS Mock] Subscriber error:', e.message);
      }
    });
  }
  
  console.log(`[HCS Mock] Message to ${topicId} (seq: ${sequenceNumber})`);
  
  res.json({
    status: 'SUCCESS',
    receipt: {
      topicId,
      sequenceNumber,
      status: 'SUCCESS'
    }
  });
});

// Query messages
app.get('/api/v1/topics/:topicId/messages', (req, res) => {
  const { topicId } = req.params;
  const { limit = 100, order = 'asc' } = req.query;
  
  const topic = topics.get(topicId);
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found' });
  }
  
  let messages = [...topic.messages];
  if (order === 'desc') {
    messages = messages.reverse();
  }
  messages = messages.slice(0, parseInt(limit));
  
  res.json({
    messages,
    links: {
      next: null // Pagination not implemented in mock
    }
  });
});

// Subscribe to topic (SSE)
app.get('/api/v1/topics/:topicId/subscribe', (req, res) => {
  const { topicId } = req.params;
  
  const topic = topics.get(topicId);
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found' });
  }
  
  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Send existing messages
  topic.messages.forEach(msg => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  });
  
  // Register subscriber
  if (!subscriptions.has(topicId)) {
    subscriptions.set(topicId, new Set());
  }
  
  const callback = (message) => {
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  };
  
  subscriptions.get(topicId).add(callback);
  
  // Cleanup on disconnect
  req.on('close', () => {
    const subs = subscriptions.get(topicId);
    if (subs) {
      subs.delete(callback);
    }
    console.log(`[HCS Mock] Subscriber disconnected from ${topicId}`);
  });
  
  console.log(`[HCS Mock] New subscriber for ${topicId}`);
});

// List all topics (admin endpoint)
app.get('/admin/topics', (req, res) => {
  const topicList = Array.from(topics.values()).map(t => ({
    topicId: t.topicId,
    memo: t.memo,
    messageCount: t.messages.length,
    createdAt: t.createdAt
  }));
  
  res.json({
    topics: topicList,
    total: topicList.length
  });
});

// Clear all topics (admin endpoint)
app.delete('/admin/topics', (req, res) => {
  topics.clear();
  subscriptions.clear();
  console.log('[HCS Mock] All topics cleared');
  res.json({ status: 'SUCCESS', message: 'All topics cleared' });
});

// Helper functions
function generateHash() {
  return Array.from({ length: 48 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('');
}

// Cleanup old messages periodically
setInterval(() => {
  if (!PERSIST) return;
  
  const cutoff = Date.now() - (RETENTION_HOURS * 60 * 60 * 1000);
  
  for (const [topicId, topic] of topics) {
    const originalCount = topic.messages.length;
    topic.messages = topic.messages.filter(m => 
      new Date(m.consensusTimestamp).getTime() > cutoff
    );
    const removed = originalCount - topic.messages.length;
    if (removed > 0) {
      console.log(`[HCS Mock] Cleaned up ${removed} old messages from ${topicId}`);
    }
  }
}, 60 * 60 * 1000); // Every hour

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  📡 HCS Mock Service                                        ║
║  Version: 1.0.0 | Port: ${PORT}                             ║
╠════════════════════════════════════════════════════════════╣
║  Features:                                                  ║
║    ✅ In-memory topic simulation                           ║
║    ✅ Message persistence: ${PERSIST}                       ║
║    ✅ Retention: ${RETENTION_HOURS} hours                   ║
║    ✅ SSE subscriptions                                    ║
║    ✅ REST API compatible with real HCS                    ║
╚════════════════════════════════════════════════════════════╝
  `);
});
