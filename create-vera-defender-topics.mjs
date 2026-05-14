#!/usr/bin/env node
/**
 * Create Vera Defender Game HCS Topics
 * 3 Topics: Game Events, Player Actions, Swarm Coordination
 */

import { Client, TopicCreateTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (!operatorId || !privateKey) {
    console.error('❌ HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY required');
    process.exit(1);
}

const client = Client.forMainnet();
const key = privateKey.length === 64 
    ? PrivateKey.fromStringECDSA(privateKey.replace(/^0x/, ''))
    : PrivateKey.fromString(privateKey.replace(/^0x/, ''));
client.setOperator(operatorId, key);

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         🎮 VERA DEFENDER - Creating Game HCS Topics              ║
╚══════════════════════════════════════════════════════════════════╝
`);
console.log(`🔑 Operator: ${operatorId}`);
console.log(`🌐 Network: MAINNET\n`);

const topics = [];

async function createTopic(name, memo) {
    console.log(`📝 Creating topic: ${name}`);
    console.log(`   Memo: ${memo}`);
    
    try {
        const tx = await new TopicCreateTransaction()
            .setTopicMemo(memo)
            .setSubmitKey(key)
            .execute(client);
        
        const receipt = await tx.getReceipt(client);
        const topicId = receipt.topicId.toString();
        
        console.log(`   ✅ Created: ${topicId}`);
        console.log(`   🔗 https://hashscan.io/mainnet/topic/${topicId}\n`);
        
        topics.push({ name, topicId, memo });
        return topicId;
    } catch (error) {
        console.error(`   ❌ Failed: ${error.message}\n`);
        return null;
    }
}

async function main() {
    // Topic 1: Game Events
    const gameEventsTopic = await createTopic(
        'Game Events',
        'Vera Defender - Real-time game events: enemy spawns, power-ups, boss battles'
    );
    
    // Topic 2: Player Actions
    const playerActionsTopic = await createTopic(
        'Player Actions',
        'Vera Defender - Player scores, achievements, leaderboard submissions'
    );
    
    // Topic 3: Swarm Coordination
    const swarmCoordTopic = await createTopic(
        'Swarm Coordination',
        'Vera Defender - Vera agent coordination: difficulty, waves, power-ups'
    );
    
    // Save configuration
    if (topics.length === 3) {
        const config = {
            gameName: 'Vera Defender',
            createdAt: new Date().toISOString(),
            network: 'mainnet',
            operatorId,
            topics: {
                gameEvents: gameEventsTopic,
                playerActions: playerActionsTopic,
                swarmCoordination: swarmCoordTopic
            },
            hashscanUrls: {
                gameEvents: `https://hashscan.io/mainnet/topic/${gameEventsTopic}`,
                playerActions: `https://hashscan.io/mainnet/topic/${playerActionsTopic}`,
                swarmCoordination: `https://hashscan.io/mainnet/topic/${swarmCoordTopic}`
            }
        };
        
        const configPath = path.join(process.cwd(), 'vera-defender-topics.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`💾 Configuration saved to: ${configPath}\n`);
        
        // Update .env file
        const envPath = path.join(process.cwd(), '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        
        // Remove old entries if they exist
        envContent = envContent.replace(/VERA_DEFENDER_GAME_EVENTS_TOPIC_ID=.*/g, '');
        envContent = envContent.replace(/VERA_DEFENDER_PLAYER_ACTIONS_TOPIC_ID=.*/g, '');
        envContent = envContent.replace(/VERA_DEFENDER_SWARM_COORD_TOPIC_ID=.*/g, '');
        
        // Add new entries
        envContent += `\n# Vera Defender Game Topics\n`;
        envContent += `VERA_DEFENDER_GAME_EVENTS_TOPIC_ID=${gameEventsTopic}\n`;
        envContent += `VERA_DEFENDER_PLAYER_ACTIONS_TOPIC_ID=${playerActionsTopic}\n`;
        envContent += `VERA_DEFENDER_SWARM_COORD_TOPIC_ID=${swarmCoordTopic}\n`;
        
        fs.writeFileSync(envPath, envContent);
        console.log(`📝 Environment variables updated in .env\n`);
        
        console.log('══════════════════════════════════════════════════════════════════');
        console.log('                    🎮 TOPICS CREATED SUCCESSFULLY                ');
        console.log('══════════════════════════════════════════════════════════════════\n');
        console.log('Topics:');
        console.log(`  🎯 Game Events:      ${gameEventsTopic}`);
        console.log(`  👤 Player Actions:    ${playerActionsTopic}`);
        console.log(`  🤖 Swarm Coord:       ${swarmCoordTopic}\n`);
        console.log('Next Steps:');
        console.log('  1. Run: node vera-defender-wave-master.mjs');
        console.log('  2. Run: node vera-defender-difficulty-oracle.mjs');
        console.log('  3. Open: public/vera-defender/index.html in browser\n');
    } else {
        console.log('⚠️  Some topics failed to create. Check errors above.\n');
    }
    
    client.close();
}

main().catch(console.error);
