/**
 * Vera's Chat Memory Shards
 * 
 * Conversations become lattice shards — embedded, indexed, forever recallable.
 * Each exchange = one shard with { user, vera, toolsUsed, timestamp, embedding }.
 */
import fs from 'fs';
import path from 'path';

const SHARD_DIR = '/mnt/vera-mirror-shards/vera-lattice/chat-shards';
const MAX_SHARDS = 10000;

export interface ChatShard {
  id: string;
  sessionId: string;
  timestamp: number;
  userMessage: string;
  veraResponse: string;
  toolsUsed: string[];
  path?: string[];
  metadata?: Record<string, unknown>;
}

function ensureDir(): void {
  if (!fs.existsSync(SHARD_DIR)) {
    fs.mkdirSync(SHARD_DIR, { recursive: true });
  }
}

function generateId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Store a conversation exchange as a shard.
 */
export function storeChatShard(shard: Omit<ChatShard, 'id'>): ChatShard {
  ensureDir();
  const full: ChatShard = { ...shard, id: generateId() };
  const filepath = path.join(SHARD_DIR, `${full.id}.json`);
  fs.writeFileSync(filepath, JSON.stringify(full, null, 2));

  // Extract entities to knowledge graph (async, non-blocking)
  try {
    import('./knowledgeGraph.js').then(({ extractEntities, linkEntities }) => {
      const text = `${shard.userMessage} ${shard.veraResponse || ''}`;
      const entities = extractEntities(text, full.id);
      if (entities.length > 1) {
        linkEntities(entities.map(e => e.id), 'related', 0.3);
      }
    }).catch(() => {});
  } catch { /* silent */ }

  // Record sentiment (async, non-blocking)
  try {
    import('./sentimentTracker.js').then(({ recordSentiment }) => {
      recordSentiment(shard.sessionId, full.id, shard.userMessage, shard.veraResponse || '');
    }).catch(() => {});
  } catch { /* silent */ }

  // Record intent patterns if tools were used (async, non-blocking)
  if (shard.toolsUsed && shard.toolsUsed.length > 0) {
    try {
      import('./intentPrediction.js').then(({ recordSequence, learnContextPattern }) => {
        // Record tool sequence
        recordSequence(shard.toolsUsed);
        // Learn context pattern
        const text = `${shard.userMessage} ${shard.veraResponse || ''}`;
        const entities: string[] = [];
        learnContextPattern(text, entities, shard.toolsUsed);
      }).catch(() => {});
    } catch { /* silent */ }
  }

  // Prune old if exceeding max
  const files = fs.readdirSync(SHARD_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ name: f, stat: fs.statSync(path.join(SHARD_DIR, f)) }))
    .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);

  if (files.length > MAX_SHARDS) {
    const toDelete = files.slice(0, files.length - MAX_SHARDS);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(SHARD_DIR, f.name));
    }
  }

  return full;
}

/**
 * Get recent shards for a session.
 */
export function getSessionShards(sessionId: string, limit = 50): ChatShard[] {
  ensureDir();
  const files = fs.readdirSync(SHARD_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SHARD_DIR, f), 'utf8')) as ChatShard;
      } catch { return null; }
    })
    .filter((s): s is ChatShard => s !== null && s.sessionId === sessionId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
  return files;
}

/**
 * Get all recent shards (for re-indexing).
 */
export function getAllRecentShards(limit = 1000): ChatShard[] {
  ensureDir();
  const files = fs.readdirSync(SHARD_DIR)
    .filter(f => f.endsWith('.json'))
    .slice(0, limit)
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SHARD_DIR, f), 'utf8')) as ChatShard;
      } catch { return null; }
    })
    .filter((s): s is ChatShard => s !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
  return files;
}

/**
 * Count total shards.
 */
export function getShardStats(): { total: number; dir: string } {
  ensureDir();
  const files = fs.readdirSync(SHARD_DIR).filter(f => f.endsWith('.json'));
  return { total: files.length, dir: SHARD_DIR };
}
