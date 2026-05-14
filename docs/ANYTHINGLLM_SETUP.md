# AnythingLLM Setup Guide for Vera

## Priority 2: Replace SQLite with Semantic Memory

### Why AnythingLLM?

| Feature | SQLite | AnythingLLM |
|---------|--------|-------------|
| Search | Exact match | **Semantic similarity** |
| Context | Manual queries | **Automatic RAG** |
| Embeddings | None | **Built-in vectors** |
| Speed | Fast for lookups | **Fast for semantic search** |
| Local | ✓ | **✓ Runs on 4060 Ti** |

### Quick Setup

```bash
# 1. Install AnythingLLM Desktop (or Docker)
# Option A: Docker (recommended for server)
docker pull mintplexlabs/anythingllm
docker run -d \
  --name anythingllm \
  -p 3001:3001 \
  -v anythingllm-data:/app/server/storage \
  mintplexlabs/anythingllm

# Option B: Desktop app
# Download from https://useanything.com

# 2. Verify it's running
curl http://localhost:3001/api/health
```

### Configure Vera

Add to `.env`:

```env
# AnythingLLM Configuration
ANYTHINGLLM_URL=http://localhost:3001
ANYTHINGLLM_API_KEY=your-api-key-here
ANYTHINGLLM_WORKSPACE=vera-memory

# Disable SQLite fallback (optional)
USE_ANYTHINGLLM=true
```

### Usage in Vera

```typescript
import { anythingLLM } from './vera/memory/anythingLLMIntegration.js';

// Store conversation with semantic embedding
await anythingLLM.storeConversation('user', 'Send 100 HBAR to Alice');

// Retrieve relevant context automatically
const { context, sources } = await anythingLLM.getContextForRAG(
  'How much did I send to Alice?',
  2000 // max tokens
);

// Semantic search (not just keywords!)
const results = await anythingLLM.semanticSearch(
  'high value transfers last week'
);
```

### Migration from SQLite

```typescript
// One-time migration script
import { db } from './db.js';
import { anythingLLM } from './vera/memory/anythingLLMIntegration.js';

const conversations = db.query('SELECT * FROM conversations');

for (const conv of conversations) {
  await anythingLLM.uploadDocument({
    title: `conv-${conv.id}`,
    content: conv.content,
    metadata: {
      timestamp: conv.created_at,
      user: conv.user_id,
      type: 'conversation',
    },
  });
}
```

### Performance

| Operation | SQLite | AnythingLLM |
|-----------|--------|-------------|
| Store | ~5ms | ~50ms (embedding) |
| Keyword Search | ~10ms | ~100ms |
| **Semantic Search** | **Not possible** | **~150ms** |
| Context Retrieval | Manual | **Automatic** |

**Trade-off**: Slightly slower writes, but powerful semantic retrieval.

---

## Quick Test

```bash
# 1. Start AnythingLLM
docker run -p 3001:3001 mintplexlabs/anythingllm

# 2. Create workspace
curl -X POST http://localhost:3001/api/v1/workspace/new \
  -H "Content-Type: application/json" \
  -d '{"name":"vera-memory"}'

# 3. Upload test document
curl -X POST http://localhost:3001/api/v1/workspace/vera-memory/document \
  -H "Content-Type: application/json" \
  -d '{
    "title":"test",
    "content":"Vera is a Hedera AI assistant with carbon tracking",
    "metadata":{"type":"fact"}
  }'

# 4. Semantic search (will match "assistant" and "carbon")
curl -X POST http://localhost:3001/api/v1/workspace/vera-memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"environmental impact","limit":5}'
```
