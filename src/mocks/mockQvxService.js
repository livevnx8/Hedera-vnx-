/**
 * Mock QVX Inference Service
 * Lightweight mock for Vera ML inference that doesn't require GPU
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 5101;

// Config
const RESPONSE_DELAY = parseInt(process.env.RESPONSE_DELAY_MS) || 100;
const DETERMINISTIC = process.env.DETERMINISTIC_OUTPUTS === 'true';

// Pre-defined responses for common prompts
const MOCK_RESPONSES = {
  'analyze': 'Analysis complete. Key findings indicate positive trends in the data with high confidence levels.',
  'carbon': 'Carbon credit validation shows PLATINUM tier quality with 99.8% verification rate.',
  'energy': 'Energy grid analysis indicates stable generation mix with renewable sources at 28%.',
  'defi': 'DeFi analysis complete. Found 3 arbitrage opportunities with expected returns of 0.15-0.45%.',
  'audit': 'Audit complete. All checks passed. No anomalies detected.',
  'default': 'Processing complete. Results indicate normal operational parameters within expected ranges.'
};

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'qvx-mock',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

// Main inference endpoint
app.post('/infer', async (req, res) => {
  const { prompt, model, max_tokens, temperature } = req.body;
  
  // Simulate processing delay
  await delay(RESPONSE_DELAY);
  
  // Generate mock response based on prompt keywords
  const response = generateMockResponse(prompt);
  
  res.json({
    text: response,
    model: model || 'vera-mock-v1',
    tokens_used: Math.floor(response.length / 4),
    finish_reason: 'stop',
    timestamp: Date.now()
  });
});

// Chat completion endpoint
app.post('/chat', async (req, res) => {
  const { messages, model, max_tokens } = req.body;
  
  await delay(RESPONSE_DELAY);
  
  const lastMessage = messages[messages.length - 1];
  const response = generateMockResponse(lastMessage.content);
  
  res.json({
    choices: [{
      message: {
        role: 'assistant',
        content: response
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: messages.length * 10,
      completion_tokens: Math.floor(response.length / 4),
      total_tokens: messages.length * 10 + Math.floor(response.length / 4)
    }
  });
});

// Embedding endpoint
app.post('/embed', async (req, res) => {
  const { input } = req.body;
  
  await delay(RESPONSE_DELAY / 2);
  
  const embeddings = Array.isArray(input) 
    ? input.map(() => generateMockEmbedding())
    : [generateMockEmbedding()];
  
  res.json({
    data: embeddings.map((embedding, i) => ({
      embedding,
      index: i,
      object: 'embedding'
    })),
    model: 'text-embedding-mock-v1'
  });
});

// Model info
app.get('/models', (req, res) => {
  res.json({
    models: [
      { id: 'vera-mock-v1', name: 'Vera Mock Model v1' },
      { id: 'text-embedding-mock-v1', name: 'Mock Embedding Model' }
    ]
  });
});

// Metrics endpoint (for Prometheus)
app.get('/metrics', (req, res) => {
  res.send(`
# HELP qvx_requests_total Total requests
# TYPE qvx_requests_total counter
qvx_requests_total 0

# HELP qvx_response_time Response time in ms
# TYPE qvx_response_time histogram
qvx_response_time_bucket{le="100"} 1
  `);
});

// Helper functions
function generateMockResponse(prompt) {
  if (!prompt) return MOCK_RESPONSES.default;
  
  const lowerPrompt = prompt.toLowerCase();
  
  // Match keywords
  for (const [keyword, response] of Object.entries(MOCK_RESPONSES)) {
    if (lowerPrompt.includes(keyword)) {
      return DETERMINISTIC 
        ? response 
        : response + ` [Confidence: ${(90 + Math.random() * 9).toFixed(1)}%]`;
    }
  }
  
  // Generic response with prompt reference
  return DETERMINISTIC
    ? MOCK_RESPONSES.default
    : `Based on your input: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}" - ${MOCK_RESPONSES.default}`;
}

function generateMockEmbedding() {
  // Generate 384-dimensional embedding (standard size)
  const embedding = [];
  for (let i = 0; i < 384; i++) {
    embedding.push((Math.random() - 0.5) * 2); // -1 to 1
  }
  return embedding;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🤖 QVX Mock Inference Service                              ║
║  Version: 1.0.0 | Port: ${PORT}                             ║
╠════════════════════════════════════════════════════════════╣
║  Features:                                                  ║
║    ✅ Fast responses (no GPU required)                     ║
║    ✅ Deterministic mode: ${DETERMINISTIC}                   ║
║    ✅ Response delay: ${RESPONSE_DELAY}ms                      ║
║    ✅ Pre-defined responses for common prompts              ║
╚════════════════════════════════════════════════════════════╝
  `);
});
