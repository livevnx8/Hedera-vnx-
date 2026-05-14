#!/usr/bin/env node
/**
 * Vera Defender - Game Launcher
 * Starts all game services: Wave Master, Difficulty Oracle, and game server
 */

import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.VERA_DEFENDER_PORT || 8888;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         🎮 VERA DEFENDER - GAME LAUNCHER                         ║
║         Hedera-Powered Space Defense System                      ║
╚══════════════════════════════════════════════════════════════════╝
`);

// Track child processes
const processes = [];

// Start Wave Master Agent
function startWaveMaster() {
    console.log('🌊 Starting Wave Master Agent...');
    const proc = spawn('node', ['vera-defender-wave-master.mjs'], {
        cwd: process.cwd(),
        stdio: 'pipe'
    });
    
    proc.stdout.on('data', (data) => {
        console.log(`[Wave Master] ${data.toString().trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
        console.error(`[Wave Master Error] ${data.toString().trim()}`);
    });
    
    processes.push({ name: 'Wave Master', proc });
    return proc;
}

// Start Difficulty Oracle Agent
function startDifficultyOracle() {
    console.log('⚖️ Starting Difficulty Oracle Agent...');
    const proc = spawn('node', ['vera-defender-difficulty-oracle.mjs'], {
        cwd: process.cwd(),
        stdio: 'pipe'
    });
    
    proc.stdout.on('data', (data) => {
        console.log(`[Difficulty Oracle] ${data.toString().trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
        console.error(`[Difficulty Oracle Error] ${data.toString().trim()}`);
    });
    
    processes.push({ name: 'Difficulty Oracle', proc });
    return proc;
}

// Start HTTP Server for Game
function startGameServer() {
    console.log(`🌐 Starting Game Server on port ${PORT}...`);
    
    const server = createServer((req, res) => {
        const url = req.url === '/' ? '/index.html' : req.url;
        const filePath = join(__dirname, 'public', 'vera-defender', url);
        
        try {
            let content;
            let contentType;
            
            if (url.endsWith('.html')) {
                content = readFileSync(filePath);
                contentType = 'text/html';
            } else if (url.endsWith('.js')) {
                content = readFileSync(filePath);
                contentType = 'application/javascript';
            } else if (url.endsWith('.css')) {
                content = readFileSync(filePath);
                contentType = 'text/css';
            } else {
                content = readFileSync(filePath);
                contentType = 'application/octet-stream';
            }
            
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content);
        } catch (error) {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    
    server.listen(PORT, () => {
        console.log(`✅ Game Server running at http://localhost:${PORT}`);
        console.log(`🎮 Open your browser and navigate to the URL above\n`);
    });
    
    return server;
}

// Display game info
function displayInfo() {
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('                    🎮 VERA DEFENDER READY                        ');
    console.log('══════════════════════════════════════════════════════════════════\n');
    console.log('Game URL: http://localhost:' + PORT);
    console.log('HCS Topics:');
    console.log(`  - Game Events: ${process.env.VERA_DEFENDER_GAME_EVENTS_TOPIC_ID || 'Not configured'}`);
    console.log(`  - Player Actions: ${process.env.VERA_DEFENDER_PLAYER_ACTIONS_TOPIC_ID || 'Not configured'}`);
    console.log(`  - Swarm Coord: ${process.env.VERA_DEFENDER_SWARM_COORD_TOPIC_ID || 'Not configured'}`);
    console.log('\nControls:');
    console.log('  ← → Arrow keys: Move ship');
    console.log('  SPACE: Shoot');
    console.log('\nPress Ctrl+C to stop all services\n');
}

// Main
async function main() {
    // Start all services
    startWaveMaster();
    await new Promise(r => setTimeout(r, 1000));
    
    startDifficultyOracle();
    await new Promise(r => setTimeout(r, 1000));
    
    startGameServer();
    
    await new Promise(r => setTimeout(r, 2000));
    displayInfo();
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Vera Defender...');
    
    processes.forEach(({ name, proc }) => {
        console.log(`Stopping ${name}...`);
        proc.kill('SIGTERM');
    });
    
    setTimeout(() => {
        console.log('✅ All services stopped\n');
        process.exit(0);
    }, 1000);
});

// Handle errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

main().catch(console.error);
