/**
 * Vera's Sentiment & Mood Tracker
 * 
 * Tracks conversation sentiment, user satisfaction, and emotional patterns
 * to adapt responses and identify friction points.
 */
import fs from 'fs';
import path from 'path';

const SENTIMENT_PATH = '/mnt/vera-mirror-shards/vera-lattice/sentiment-data.json';

// Simple sentiment lexicon
const SENTIMENT_LEXICON: Record<string, number> = {
  // Positive
  'thank': 2, 'thanks': 2, 'great': 2, 'awesome': 3, 'excellent': 3,
  'perfect': 3, 'love': 3, 'best': 2, 'good': 1, 'nice': 1,
  'happy': 2, 'pleased': 2, 'satisfied': 2, 'works': 1, 'working': 1,
  'success': 2, 'successful': 2, 'done': 1, 'completed': 1,
  // Negative
  'error': -2, 'fail': -2, 'failed': -2, 'failure': -3, 'broken': -3,
  'bug': -2, 'problem': -2, 'issue': -2, 'wrong': -2, 'bad': -2,
  'terrible': -3, 'awful': -3, 'hate': -3, 'worst': -3, 'annoying': -2,
  'frustrated': -2, 'frustrating': -2, 'confused': -1, 'confusing': -1,
  'stuck': -2, 'help': -1, 'not working': -3,
};

interface SentimentEntry {
  timestamp: number;
  sessionId: string;
  shardId: string;
  score: number;
  magnitude: number;
  label: 'positive' | 'neutral' | 'negative';
  keywords: string[];
}

interface SentimentStats {
  entries: SentimentEntry[];
  hourlyAverage: Record<number, number>;
  dailyTrend: number[];
  overallMood: 'positive' | 'neutral' | 'negative';
  satisfactionEstimate: number; // 0-100
}

let stats: SentimentStats = {
  entries: [],
  hourlyAverage: {},
  dailyTrend: [],
  overallMood: 'neutral',
  satisfactionEstimate: 50,
};

function load(): void {
  try {
    if (fs.existsSync(SENTIMENT_PATH)) {
      stats = JSON.parse(fs.readFileSync(SENTIMENT_PATH, 'utf8'));
    }
  } catch { /* silent */ }
}

function save(): void {
  try {
    const dir = path.dirname(SENTIMENT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SENTIMENT_PATH, JSON.stringify(stats, null, 2));
  } catch { /* silent */ }
}

function calculateSentiment(text: string): { score: number; magnitude: number; keywords: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  let magnitude = 0;
  const keywords: string[] = [];
  
  for (const [word, weight] of Object.entries(SENTIMENT_LEXICON)) {
    const count = (lower.match(new RegExp(word, 'g')) || []).length;
    if (count > 0) {
      score += weight * count;
      magnitude += Math.abs(weight) * count;
      keywords.push(word);
    }
  }
  
  // Normalize by text length (longer texts can accumulate more words)
  const words = lower.split(/\s+/).length;
  if (words > 10) {
    score = score / (words / 10);
    magnitude = magnitude / (words / 10);
  }
  
  return { score, magnitude, keywords };
}

export function recordSentiment(
  sessionId: string,
  shardId: string,
  userMessage: string,
  veraResponse: string
): void {
  load();
  
  // Analyze user message (their sentiment) and Vera's response
  const userSentiment = calculateSentiment(userMessage);
  const veraSentiment = calculateSentiment(veraResponse);
  
  // Combined score (user sentiment weighs more - their experience matters)
  const combinedScore = userSentiment.score * 0.7 + veraSentiment.score * 0.3;
  
  let label: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (combinedScore > 0.5) label = 'positive';
  else if (combinedScore < -0.5) label = 'negative';
  
  const entry: SentimentEntry = {
    timestamp: Date.now(),
    sessionId,
    shardId,
    score: combinedScore,
    magnitude: userSentiment.magnitude + veraSentiment.magnitude,
    label,
    keywords: [...new Set([...userSentiment.keywords, ...veraSentiment.keywords])],
  };
  
  stats.entries.push(entry);
  
  // Keep only last 10000 entries
  if (stats.entries.length > 10000) {
    stats.entries = stats.entries.slice(-10000);
  }
  
  recalculateStats();
  save();
}

function recalculateStats(): void {
  // Hourly averages (last 24 hours)
  const hourAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentEntries = stats.entries.filter(e => e.timestamp > hourAgo);
  
  stats.hourlyAverage = {};
  for (const entry of recentEntries) {
    const hour = new Date(entry.timestamp).getHours();
    const existing = stats.hourlyAverage[hour] || 0;
    stats.hourlyAverage[hour] = existing + entry.score;
  }
  
  // Daily trend (last 7 days)
  const dayScores: number[][] = Array(7).fill(null).map(() => []);
  const now = Date.now();
  
  for (const entry of stats.entries) {
    const daysAgo = Math.floor((now - entry.timestamp) / (24 * 60 * 60 * 1000));
    if (daysAgo < 7) {
      dayScores[daysAgo].push(entry.score);
    }
  }
  
  stats.dailyTrend = dayScores.map(scores => 
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  ).reverse();
  
  // Overall mood
  const recent = stats.entries.slice(-100);
  if (recent.length > 0) {
    const avg = recent.reduce((s, e) => s + e.score, 0) / recent.length;
    if (avg > 0.3) stats.overallMood = 'positive';
    else if (avg < -0.3) stats.overallMood = 'negative';
    else stats.overallMood = 'neutral';
    
    // Satisfaction estimate (0-100)
    stats.satisfactionEstimate = Math.max(0, Math.min(100, 50 + avg * 25));
  }
}

export function getSentimentStats(): SentimentStats {
  load();
  return stats;
}

export function getCurrentMood(): { mood: string; satisfaction: number; recentTrend: 'up' | 'down' | 'stable' } {
  load();
  
  const recent = stats.entries.slice(-20);
  const older = stats.entries.slice(-40, -20);
  
  const recentAvg = recent.length > 0 ? recent.reduce((s, e) => s + e.score, 0) / recent.length : 0;
  const olderAvg = older.length > 0 ? older.reduce((s, e) => s + e.score, 0) / older.length : 0;
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (recentAvg > olderAvg + 0.2) trend = 'up';
  else if (recentAvg < olderAvg - 0.2) trend = 'down';
  
  return {
    mood: stats.overallMood,
    satisfaction: Math.round(stats.satisfactionEstimate),
    recentTrend: trend,
  };
}

export function getNegativeSignals(limit = 10): SentimentEntry[] {
  load();
  return stats.entries
    .filter(e => e.label === 'negative')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

// Initialize
load();
