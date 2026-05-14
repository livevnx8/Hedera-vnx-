---
description: Persistent conversation memory across sessions
---

# Setup Session Memory

Long-term memory so Vera remembers users across sessions.

## Memory Architecture

```
User Query → Short-term (Redis) → Long-term (SQLite + Lattice) → Semantic Index
```

## Install

```bash
cat > src/memory/sessionMemory.ts << 'EOF'
import Database from 'better-sqlite3';

const db = new Database('/home/vera-live-0-1/hedera-llm-api/vera-memory.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    startedAt INTEGER,
    lastActive INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId TEXT,
    role TEXT,
    content TEXT,
    timestamp INTEGER,
    embedding BLOB
  );
  
  CREATE TABLE IF NOT EXISTS user_facts (
    userId TEXT,
    key TEXT,
    value TEXT,
    learnedAt INTEGER,
    confidence REAL,
    PRIMARY KEY (userId, key)
  );
  
  CREATE INDEX IF NOT EXISTS idx_session_user ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(sessionId);
`);

export class SessionMemory {
  addMessage(sessionId: string, role: string, content: string): void {
    db.prepare('INSERT INTO messages (sessionId, role, content, timestamp) VALUES (?, ?, ?, ?)')
      .run(sessionId, role, content, Date.now());
  }
  
  getHistory(sessionId: string, limit = 20): any[] {
    return db.prepare('SELECT role, content, timestamp FROM messages WHERE sessionId = ? ORDER BY timestamp DESC LIMIT ?')
      .all(sessionId, limit);
  }
  
  learnFact(userId: string, key: string, value: string, confidence: number = 1.0): void {
    db.prepare(`INSERT OR REPLACE INTO user_facts (userId, key, value, learnedAt, confidence) VALUES (?, ?, ?, ?, ?)`)
      .run(userId, key, value, Date.now(), confidence);
  }
  
  recall(userId: string): Record<string, string> {
    const facts = db.prepare('SELECT key, value FROM user_facts WHERE userId = ?').all(userId);
    return Object.fromEntries(facts.map((f: any) => [f.key, f.value]));
  }
}

export const sessionMemory = new SessionMemory();
EOF
```

## Integration

```bash
# On every response, extract facts:
node -e "
import { sessionMemory } from './src/memory/sessionMemory.js';
sessionMemory.learnFact('user-001', 'preferred_dex', 'saucerswap', 0.9);
sessionMemory.learnFact('user-001', 'timezone', 'EST', 1.0);
"
```

## Memory Recall in Prompts

```javascript
const facts = sessionMemory.recall(userId);
const context = `Known about user: ${JSON.stringify(facts)}\n\nConversation:\n${history}`;
```

## Memory Analytics

```bash
curl http://localhost:8088/api/memory/analytics | jq '.{
  totalUsers: .users,
  totalMessages: .messages,
  avgSessionLength: .avgMessages,
  topFacts: .topLearned
}'
```
