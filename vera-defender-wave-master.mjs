#!/usr/bin/env node
/**
 * Vera Defender - Wave Master Agent
 * Controls enemy wave spawning via HCS topics
 * Role: DeFi Analyst Agent specialized in game coordination
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey, TopicMessageQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const gameEventsTopic = process.env.VERA_DEFENDER_GAME_EVENTS_TOPIC_ID || '0.0.10414316';
const swarmCoordTopic = process.env.VERA_DEFENDER_SWARM_COORD_TOPIC_ID || '0.0.10414318';

if (!operatorId || !privateKey) {
    console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
    process.exit(1);
}

const client = Client.forMainnet();
const key = privateKey.length === 64 
    ? PrivateKey.fromStringECDSA(privateKey.replace(/^0x/, ''))
    : PrivateKey.fromString(privateKey.replace(/^0x/, ''));
client.setOperator(operatorId, key);

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         🌊 VERA DEFENDER - WAVE MASTER AGENT                     ║
║              Enemy Formation Controller                          ║
╚══════════════════════════════════════════════════════════════════╝
`);
console.log(`🔑 Operator: ${operatorId}`);
console.log(`🎯 Game Events Topic: ${gameEventsTopic}`);
console.log(`🤖 Swarm Coord Topic: ${swarmCoordTopic}\n`);

class WaveMasterAgent {
    constructor() {
        this.agentId = 'wave-master-001';
        this.type = 'DEFI_ANALYST';
        this.waveCount = 0;
        this.activeGames = new Map();
        this.difficultyMultiplier = 1.0;
    }

    async logToHCS(topicId, type, data) {
        try {
            const message = {
                type,
                agentId: this.agentId,
                agentType: this.type,
                timestamp: Date.now(),
                ...data
            };

            await new Promise(r => setTimeout(r, 100)); // Rate limit protection

            const tx = await new TopicMessageSubmitTransaction()
                .setTopicId(topicId)
                .setMessage(JSON.stringify(message))
                .execute(client);

            const receipt = await tx.getReceipt(client);
            return receipt.topicSequenceNumber?.toString();
        } catch (error) {
            console.log(`⚠️ HCS log failed: ${error.message.substring(0, 50)}`);
            return null;
        }
    }

    generateWaveConfig(waveNumber, playerSkill) {
        // Adaptive difficulty based on player performance
        const baseEnemies = 16;
        const enemyGrowth = Math.min(waveNumber * 2, 20);
        const difficultyMod = playerSkill > 0.8 ? 1.3 : playerSkill < 0.4 ? 0.8 : 1.0;
        
        const totalEnemies = Math.floor((baseEnemies + enemyGrowth) * difficultyMod);
        const rows = Math.min(4 + Math.floor(waveNumber / 3), 7);
        const cols = Math.ceil(totalEnemies / rows);
        
        // Determine special events
        const specialEvents = [];
        if (waveNumber % 5 === 0) specialEvents.push('BOSS_BATTLE');
        if (waveNumber % 3 === 0) specialEvents.push('CARBON_SURGE');
        if (waveNumber % 7 === 0) specialEvents.push('FAST_WAVE');
        
        // Enemy composition
        const composition = {
            carbonMinion: Math.floor(totalEnemies * 0.6),
            gasGuzzler: Math.floor(totalEnemies * 0.25),
            validator: Math.floor(totalEnemies * 0.1),
            topicTerror: Math.floor(totalEnemies * 0.05)
        };
        
        return {
            waveNumber,
            totalEnemies,
            rows,
            cols,
            difficulty: (1 + waveNumber * 0.1).toFixed(2),
            specialEvents,
            composition,
            spawnDelay: Math.max(500, 2000 - waveNumber * 50),
            movementSpeed: Math.min(5, 2 + waveNumber * 0.2),
            powerUpChance: Math.min(0.3, 0.1 + waveNumber * 0.01)
        };
    }

    async startWave(playerId, waveNumber, playerSkill = 0.5) {
        console.log(`\n🌊 Starting Wave ${waveNumber} for player ${playerId}`);
        
        const config = this.generateWaveConfig(waveNumber, playerSkill);
        
        // Log to Game Events topic
        const seq = await this.logToHCS(gameEventsTopic, 'WAVE_START', {
            playerId,
            waveNumber,
            config,
            timestamp: Date.now()
        });
        
        if (seq) {
            console.log(`   ✅ Wave config published to HCS (seq: ${seq})`);
            console.log(`   📊 Enemies: ${config.totalEnemies} | Difficulty: ${config.difficulty}x`);
            console.log(`   🎲 Special: ${config.specialEvents.join(', ') || 'None'}`);
            console.log(`   🔗 https://hashscan.io/mainnet/topic/${gameEventsTopic}/${seq}`);
        }
        
        // Coordinate with other agents via Swarm topic
        await this.logToHCS(swarmCoordTopic, 'WAVE_COORDINATION', {
            playerId,
            waveNumber,
            requestingAgents: ['difficulty-oracle', 'powerup-oracle'],
            config
        });
        
        this.waveCount++;
        this.activeGames.set(playerId, { wave: waveNumber, config });
        
        return config;
    }

    async announceBoss(playerId, waveNumber, bossType) {
        console.log(`\n👹 BOSS BATTLE: ${bossType} (Wave ${waveNumber})`);
        
        const bossConfig = {
            type: bossType,
            hp: 20 + waveNumber * 5,
            speed: Math.min(4, 2 + waveNumber * 0.1),
            attackPattern: bossType === 'CONSENSUS_DRAGON' ? 'fire_breath' : 
                          bossType === 'FORK_PHOENIX' ? 'teleport' : 'charge',
            weakPoint: Math.random() > 0.5 ? 'core' : 'shield_generator'
        };
        
        const seq = await this.logToHCS(gameEventsTopic, 'BOSS_SPAWN', {
            playerId,
            waveNumber,
            boss: bossConfig,
            timestamp: Date.now()
        });
        
        if (seq) {
            console.log(`   🔥 ${bossType} enters the battle!`);
            console.log(`   ❤️ HP: ${bossConfig.hp} | Speed: ${bossConfig.speed}x`);
            console.log(`   ⚔️ Attack: ${bossConfig.attackPattern}`);
            console.log(`   🔗 https://hashscan.io/mainnet/topic/${gameEventsTopic}/${seq}`);
        }
        
        // Request swarm assistance
        await this.logToHCS(swarmCoordTopic, 'BOSS_ASSISTANCE_REQUEST', {
            playerId,
            bossType,
            assistanceNeeded: ['POWERUP_DROPS', 'DIFFICULTY_ADJUST'],
            priority: 'HIGH'
        });
    }

    async handleWaveComplete(playerId, waveNumber, stats) {
        console.log(`\n✅ Wave ${waveNumber} Complete - Player ${playerId}`);
        
        const performance = {
            accuracy: stats.accuracy || 0.7,
            kills: stats.kills || 0,
            damageTaken: stats.damageTaken || 0,
            powerUpsCollected: stats.powerUps || 0,
            timeElapsed: stats.timeElapsed || 0
        };
        
        // Calculate skill rating
        const skillRating = this.calculateSkill(performance);
        
        await this.logToHCS(gameEventsTopic, 'WAVE_COMPLETE', {
            playerId,
            waveNumber,
            performance,
            skillRating,
            nextWaveDifficulty: this.difficultyMultiplier,
            timestamp: Date.now()
        });
        
        console.log(`   🎯 Accuracy: ${(skillRating * 100).toFixed(0)}%`);
        console.log(`   💀 Kills: ${performance.kills}`);
        console.log(`   ⚡ Next wave difficulty: ${this.difficultyMultiplier.toFixed(2)}x`);
    }

    calculateSkill(performance) {
        const accuracyWeight = 0.4;
        const speedWeight = 0.3;
        const survivalWeight = 0.3;
        
        const accuracy = performance.accuracy;
        const speed = Math.min(1, 60 / performance.timeElapsed); // Faster = better
        const survival = Math.max(0, 1 - performance.damageTaken / 100);
        
        const skill = (accuracy * accuracyWeight + speed * speedWeight + survival * survivalWeight);
        
        // Adjust difficulty multiplier
        if (skill > 0.85) this.difficultyMultiplier = Math.min(2.0, this.difficultyMultiplier + 0.1);
        else if (skill < 0.5) this.difficultyMultiplier = Math.max(0.7, this.difficultyMultiplier - 0.1);
        
        return skill;
    }

    async runDemo() {
        console.log('\n══════════════════════════════════════════════════════════════════');
        console.log('                    🎮 WAVE MASTER DEMO                           ');
        console.log('══════════════════════════════════════════════════════════════════\n');
        
        const testPlayer = 'player-demo-001';
        
        // Simulate 10 waves
        for (let wave = 1; wave <= 10; wave++) {
            await this.startWave(testPlayer, wave, 0.6 + wave * 0.02);
            
            // Boss every 5 waves
            if (wave % 5 === 0) {
                const bosses = ['CONGESTION_KRAKEN', 'FORK_PHOENIX', 'GAS_FEE_GOLEM', 'CONSENSUS_DRAGON'];
                const boss = bosses[(wave / 5 - 1) % bosses.length];
                await this.announceBoss(testPlayer, wave, boss);
            }
            
            // Simulate wave completion
            await new Promise(r => setTimeout(r, 1500));
            
            await this.handleWaveComplete(testPlayer, wave, {
                accuracy: 0.7 + Math.random() * 0.2,
                kills: 16 + wave * 2,
                damageTaken: Math.random() * 50,
                powerUps: Math.floor(Math.random() * 3),
                timeElapsed: 30 + Math.random() * 20
            });
            
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.log('\n══════════════════════════════════════════════════════════════════');
        console.log('                    ✅ DEMO COMPLETE                              ');
        console.log('══════════════════════════════════════════════════════════════════\n');
        console.log(`📊 Total waves generated: ${this.waveCount}`);
        console.log(`🎯 Final difficulty multiplier: ${this.difficultyMultiplier.toFixed(2)}x`);
    }
}

// Create agent and run demo
const waveMaster = new WaveMasterAgent();

// Run immediately
waveMaster.runDemo().then(() => {
    console.log('\n🛑 Wave Master Agent shutting down...');
    client.close();
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    client.close();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Wave Master Agent stopping...');
    client.close();
    process.exit(0);
});
