#!/usr/bin/env node
/**
 * Vera Defender - HashScan Links
 * Display all HashScan URLs for game topics
 */

import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         🔍 VERA DEFENDER - HASHSCAN LINKS                        ║
╚══════════════════════════════════════════════════════════════════╝
`);

// Check for topic config file
let topics = {};
try {
    const config = JSON.parse(fs.readFileSync('./vera-defender-topics.json', 'utf8'));
    topics = config.topics;
    console.log('✅ Using created topics from vera-defender-topics.json\n');
} catch {
    // Use environment variables or defaults
    topics = {
        gameEvents: process.env.VERA_DEFENDER_GAME_EVENTS_TOPIC_ID || '0.0.10414316',
        playerActions: process.env.VERA_DEFENDER_PLAYER_ACTIONS_TOPIC_ID || '0.0.10414317',
        swarmCoordination: process.env.VERA_DEFENDER_SWARM_COORD_TOPIC_ID || '0.0.10414318'
    };
    console.log('⚠️  Using demo topic IDs (run create-vera-defender-topics.mjs for real topics)\n');
}

console.log('══════════════════════════════════════════════════════════════════');
console.log('                    🎮 GAME TOPICS                                 ');
console.log('══════════════════════════════════════════════════════════════════\n');

const topicData = [
    {
        name: 'Game Events',
        id: topics.gameEvents,
        purpose: 'Real-time game events: enemy spawns, power-ups, boss battles',
        url: `https://hashscan.io/mainnet/topic/${topics.gameEvents}`
    },
    {
        name: 'Player Actions',
        id: topics.playerActions,
        purpose: 'Player scores, achievements, leaderboard submissions',
        url: `https://hashscan.io/mainnet/topic/${topics.playerActions}`
    },
    {
        name: 'Swarm Coordination',
        id: topics.swarmCoordination,
        purpose: 'Vera agent coordination: difficulty, waves, power-ups',
        url: `https://hashscan.io/mainnet/topic/${topics.swarmCoordination}`
    }
];

for (const topic of topicData) {
    console.log(`📡 ${topic.name}`);
    console.log(`   Topic ID: ${topic.id}`);
    console.log(`   Purpose: ${topic.purpose}`);
    console.log(`   🔗 ${topic.url}\n`);
}

console.log('══════════════════════════════════════════════════════════════════');
console.log('                    🤖 AGENT SUBMISSIONS                         ');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('Wave Master Agent submits to:');
console.log(`   • Game Events: ${topicData[0].url}`);
console.log(`   • Swarm Coord: ${topicData[2].url}\n`);

console.log('Difficulty Oracle Agent submits to:');
console.log(`   • Player Actions: ${topicData[1].url}`);
console.log(`   • Swarm Coord: ${topicData[2].url}\n`);

console.log('══════════════════════════════════════════════════════════════════');
console.log('                    📊 MESSAGE TYPES                             ');
console.log('══════════════════════════════════════════════════════════════════\n');

const messageTypes = [
    { type: 'WAVE_START', topic: 'Game Events', desc: 'New wave configuration' },
    { type: 'BOSS_SPAWN', topic: 'Game Events', desc: 'Boss battle initiated' },
    { type: 'ENEMY_DESTROYED', topic: 'Game Events', desc: 'Enemy kill + score' },
    { type: 'POWERUP_COLLECTED', topic: 'Game Events', desc: 'Player got power-up' },
    { type: 'PLAYER_HIT', topic: 'Player Actions', desc: 'Damage taken' },
    { type: 'SCORE_SUBMIT', topic: 'Player Actions', desc: 'Final score' },
    { type: 'TRANSACTION', topic: 'Swarm Coord', desc: 'HBAR payment recorded' },
    { type: 'SESSION_END', topic: 'Swarm Coord', desc: 'Game session complete' }
];

for (const msg of messageTypes) {
    console.log(`   ${msg.type.padEnd(20)} → ${msg.topic.padEnd(15)} (${msg.desc})`);
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('                    💰 REVENUE TRACKING                         ');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('Economics (per game):');
console.log('   • Game cost: 0.01 HBAR (~$0.002)');
console.log('   • Continue cost: 0.05 HBAR (~$0.01)');
console.log('   • Earnings: 0.001 HBAR per 1000 points');
console.log('   • Platform fee: 10%\n');

console.log('Cost Optimization:');
console.log('   • HCS batching: 10 messages per transaction (90% savings)');
console.log('   • Auto-flush: Every 5 seconds');
console.log('   • Estimated cost per session: ~0.0001 HBAR\n');

console.log('══════════════════════════════════════════════════════════════════');
console.log('                    🚀 QUICK LINKS                              ');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('Game:');
console.log('   🎮 http://localhost:8888 (after running launcher)\n');

console.log('Lattice Visualization:');
console.log(`   🌐 file://${process.cwd()}/public/vera-defender/lattice.html\n`);

console.log('HashScan Mainnet Explorer:');
console.log('   🔗 https://hashscan.io/mainnet\n');

console.log('══════════════════════════════════════════════════════════════════');
console.log('                    📋 NEXT STEPS                               ');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('1. Create real topics (if not done):');
console.log('   node create-vera-defender-topics.mjs\n');

console.log('2. Launch the game:');
console.log('   node vera-defender-launcher.mjs\n');

console.log('3. Watch HashScan for live messages:\n');

// Open HashScan if requested
if (process.argv.includes('--open')) {
    const { exec } = await import('child_process');
    const url = topicData[0].url;
    console.log(`Opening ${url}...`);
    exec(`open ${url}`); // macOS
    // exec(`xdg-open ${url}`); // Linux
    // exec(`start ${url}`); // Windows
}
