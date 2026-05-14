/**
 * Vera's Knowledge Graph
 * 
 * Extracts entities (tokens, accounts, topics, contracts) from conversations
 * and builds a queryable graph of relationships for semantic recall.
 */
import fs from 'fs';
import path from 'path';

const GRAPH_PATH = '/mnt/vera-mirror-shards/vera-lattice/knowledge-graph.json';

export interface Entity {
  id: string;
  type: 'token' | 'account' | 'topic' | 'contract' | 'shard' | 'agent';
  value: string;
  name?: string;
  firstSeen: number;
  lastSeen: number;
  mentionCount: number;
  relatedEntities: string[];
  sourceShards: string[];
}

export interface Relationship {
  from: string;
  to: string;
  type: 'created' | 'uses' | 'references' | 'depends' | 'related';
  weight: number;
  firstSeen: number;
  lastSeen: number;
}

interface KnowledgeGraph {
  entities: Record<string, Entity>;
  relationships: Relationship[];
  lastUpdated: number;
}

let graph: KnowledgeGraph = { entities: {}, relationships: [], lastUpdated: 0 };
let flushTimeout: NodeJS.Timeout | null = null;

function loadGraph(): void {
  try {
    if (fs.existsSync(GRAPH_PATH)) {
      graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
    }
  } catch { /* silent */ }
}

function saveGraph(): void {
  try {
    const dir = path.dirname(GRAPH_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2));
    graph.lastUpdated = Date.now();
  } catch { /* silent */ }
}

function debouncedSave(): void {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(saveGraph, 5000);
}

// Entity extractors
const EXTRACTORS = {
  token: /\b0\.0\.\d{3,8}\b/g,
  account: /\b0\.0\.[1-9]\d{0,6}\b/g,
  topic: /\b0\.0\.\d{6,10}\b/g,
  contract: /\b0\.0\.\d{7,10}\b/g,
};

export function extractEntities(text: string, shardId: string): Entity[] {
  const found: Entity[] = [];
  const now = Date.now();

  for (const [type, regex] of Object.entries(EXTRACTORS)) {
    const matches = text.match(regex) || [];
    for (const value of [...new Set(matches)]) {
      const id = `${type}:${value}`;
      
      if (graph.entities[id]) {
        const e = graph.entities[id];
        e.mentionCount++;
        e.lastSeen = now;
        if (!e.sourceShards.includes(shardId)) e.sourceShards.push(shardId);
      } else {
        const entity: Entity = {
          id,
          type: type as Entity['type'],
          value,
          firstSeen: now,
          lastSeen: now,
          mentionCount: 1,
          relatedEntities: [],
          sourceShards: [shardId],
        };
        graph.entities[id] = entity;
        found.push(entity);
      }
    }
  }

  debouncedSave();
  return found;
}

export function linkEntities(entityIds: string[], type: Relationship['type'] = 'related', weight = 0.5): void {
  const now = Date.now();
  
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      const from = entityIds[i];
      const to = entityIds[j];
      
      // Update entity cross-references
      if (graph.entities[from] && !graph.entities[from].relatedEntities.includes(to)) {
        graph.entities[from].relatedEntities.push(to);
      }
      if (graph.entities[to] && !graph.entities[to].relatedEntities.includes(from)) {
        graph.entities[to].relatedEntities.push(from);
      }

      // Add/update relationship
      const existing = graph.relationships.find(r => 
        (r.from === from && r.to === to) || (r.from === to && r.to === from)
      );
      
      if (existing) {
        existing.weight = Math.min(1, existing.weight + 0.1);
        existing.lastSeen = now;
      } else {
        graph.relationships.push({ from, to, type, weight, firstSeen: now, lastSeen: now });
      }
    }
  }

  debouncedSave();
}

export function queryEntities(type?: Entity['type'], limit = 50): Entity[] {
  loadGraph();
  let results = Object.values(graph.entities);
  if (type) results = results.filter(e => e.type === type);
  return results
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, limit);
}

export function getEntityGraph(entityId: string, depth = 2): { entity: Entity | null; neighbors: Entity[] } {
  loadGraph();
  const entity = graph.entities[entityId] || null;
  if (!entity || depth <= 0) return { entity, neighbors: [] };

  const neighborIds = entity.relatedEntities.slice(0, 20);
  const neighbors = neighborIds
    .map(id => graph.entities[id])
    .filter((e): e is Entity => !!e);

  return { entity, neighbors };
}

export function getGraphStats(): { entities: number; relationships: number; byType: Record<string, number> } {
  loadGraph();
  const byType: Record<string, number> = {};
  for (const e of Object.values(graph.entities)) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }
  return {
    entities: Object.keys(graph.entities).length,
    relationships: graph.relationships.length,
    byType,
  };
}

// Initialize
loadGraph();
