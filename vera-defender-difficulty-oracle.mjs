#!/usr/bin/env node
/**
 * Vera Defender - Difficulty Oracle Agent
 * Monitors player performance and adjusts game difficulty via HCS
 * Role: Energy Auditor Agent specialized in adaptive balancing
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey, TopicMessageQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
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
║         ⚖️ VERA DEFENDER - DIFFICULTY ORACLE AGENT                ║
║              Adaptive Difficulty Controller                      ║
╚══════════════════════════════════════════════════════════════════╝
`);
console.log(`🔑 Operator: ${operatorId}`);
console.log(`🤖 Swarm Coord Topic: ${swarmCoordTopic}\n`);

class DifficultyOracleAgent {
    constructor() {
        this.agentId = 'difficulty-oracle-001';
        this.type = 'ENERGY_AUDITOR';
        this.playerProfiles = new Map();
        this.globalDifficulty = 1.0;
        this.adjustmentHistory = [];
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

            await new Promise(r => setTimeout(r, 100));

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

    analyzePlayerPerformance(playerId, metrics) {
        const profile = this.playerProfiles.get(playerId) || {
            gamesPlayed: 0,
            avgAccuracy: 0.5,
            avgWave: 1,
            skillTrend: [],
            difficultyPreference: 1.0
        };

        // Update profile
        profile.gamesPlayed++;
        
        // Calculate weighted accuracy (recent games weighted more)
        const recencyWeight = Math.min(0.3, 0.1 * profile.gamesPlayed);
        profile.avgAccuracy = (profile.avgAccuracy * (1 - recencyWeight)) + (metrics.accuracy * recencyWeight);
        
        // Track skill trend (last 5 games)
        profile.skillTrend.push(metrics.accuracy);
        if (profile.skillTrend.length > 5) profile.skillTrend.shift();
        
        // Calculate trend direction
        const trend = this.calculateTrend(profile.skillTrend);
        
        // Determine difficulty adjustment
        let adjustment = 0;
        let reasoning = '';
        
        if (profile.avgAccuracy > 0.85 && trend > 0) {
            adjustment = 0.15;
            reasoning = 'Elite player showing improvement - increase challenge';
        } else if (profile.avgAccuracy > 0.8) {
            adjustment = 0.1;
            reasoning = 'High performer - moderate difficulty increase';
        } else if (profile.avgAccuracy < 0.4 && trend < 0) {
            adjustment = -0.2;
            reasoning = 'Struggling player declining - significant help needed';
        } else if (profile.avgAccuracy < 0.5) {
            adjustment = -0.1;
            reasoning = 'Below average - slight difficulty reduction';
        } else if (profile.avgAccuracy >= 0.6 && profile.avgAccuracy <= 0.75) {
            adjustment = 0;
            reasoning = 'Optimal performance zone - maintain current difficulty';
        }
        
        // Apply adjustment with smoothing
        const oldDifficulty = profile.difficultyPreference;
        profile.difficultyPreference = Math.max(0.5, Math.min(2.0, 
            profile.difficultyPreference + adjustment
        ));
        
        this.playerProfiles.set(playerId, profile);
        
        return {
            playerId,
            oldDifficulty,
            newDifficulty: profile.difficultyPreference,
            adjustment,
            reasoning,
            trend,
            confidence: this.calculateConfidence(profile)
        };
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        const first = values[0];
        const last = values[values.length - 1];
        return last - first;
    }

    calculateConfidence(profile) {
        // More games = higher confidence
        const baseConfidence = Math.min(0.9, 0.5 + profile.gamesPlayed * 0.05);
        
        // Lower variance = higher confidence
        const variance = this.calculateVariance(profile.skillTrend);
        const consistencyBonus = variance < 0.1 ? 0.1 : 0;
        
        return Math.min(0.95, baseConfidence + consistencyBonus);
    }

    calculateVariance(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b) / values.length);
    }

    async adjustDifficulty(playerId, metrics) {
        console.log(`\n⚖️ Analyzing player ${playerId} performance...`);
        
        const analysis = this.analyzePlayerPerformance(playerId, metrics);
        
        console.log(`   📊 Games played: ${this.playerProfiles.get(playerId).gamesPlayed}`);
        console.log(`   🎯 Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
        console.log(`   📈 Trend: ${analysis.trend > 0 ? '↗️ Improving' : analysis.trend < 0 ? '↘️ Declining' : '➡️ Stable'}`);
        console.log(`   ⚖️ Difficulty: ${analysis.oldDifficulty.toFixed(2)}x → ${analysis.newDifficulty.toFixed(2)}x`);
        console.log(`   💡 Reason: ${analysis.reasoning}`);
        
        // Publish adjustment to HCS
        const seq = await this.logToHCS(swarmCoordTopic, 'DIFFICULTY_ADJUSTMENT', {
            playerId,
            ...analysis,
            swarmConsensus: await this.requestSwarmConsensus(playerId, analysis),
            timestamp: Date.now()
        });
        
        if (seq) {
            console.log(`   ✅ Published to HCS (seq: ${seq})`);
            console.log(`   🔗 https://hashscan.io/mainnet/topic/${swarmCoordTopic}/${seq}`);
        }
        
        this.adjustmentHistory.push({
            timestamp: Date.now(),
            playerId,
            ...analysis
        });
        
        return analysis;
    }

    async requestSwarmConsensus(playerId, analysis) {
        // Simulate multi-agent consensus
        console.log(`\n🤖 Requesting swarm consensus for ${playerId}...`);
        
        // Other agents would vote based on their domain
        const votes = {
            'wave-master-001': analysis.newDifficulty > 1.2 ? 'NO' : analysis.newDifficulty < 0.8 ? 'NO' : 'YES',
            'powerup-oracle-001': analysis.adjustment > 0 ? 'YES' : analysis.adjustment < -0.15 ? 'YES' : 'ABSTAIN',
            'security-guardian-001': 'YES'
        };
        
        const yesVotes = Object.values(votes).filter(v => v === 'YES').length;
        const noVotes = Object.values(votes).filter(v => v === 'NO').length;
        const total = Object.keys(votes).length;
        
        const consensus = yesVotes / total;
        const approved = consensus >= 0.6;
        
        console.log(`   🗳️ Votes: ${yesVotes} YES, ${noVotes} NO, ${total - yesVotes - noVotes} ABSTAIN`);
        console.log(`   📊 Consensus: ${(consensus * 100).toFixed(0)}% - ${approved ? '✅ APPROVED' : '⚠️ REJECTED'}`);
        
        await this.logToHCS(swarmCoordTopic, 'SWARM_CONSENSUS', {
            playerId,
            proposal: 'DIFFICULTY_ADJUSTMENT',
            votes,
            consensus,
            approved,
            timestamp: Date.now()
        });
        
        return { consensus, approved, votes };
    }

    async triggerPowerUp(playerId, triggerReason) {
        const powerUps = ['SHIELD', 'MULTI_SHOT', 'HBAR_BLAST', 'SLOW_MO'];
        const selected = powerUps[Math.floor(Math.random() * powerUps.length)];
        
        console.log(`\n🎁 Triggering power-up for ${playerId}: ${selected}`);
        console.log(`   Reason: ${triggerReason}`);
        
        const seq = await this.logToHCS(swarmCoordTopic, 'POWERUP_TRIGGER', {
            playerId,
            powerUp: selected,
            reason: triggerReason,
            duration: selected === 'SHIELD' ? 10000 : selected === 'MULTI_SHOT' ? 15000 : 8000,
            timestamp: Date.now()
        });
        
        if (seq) {
            console.log(`   ✅ Power-up published (seq: ${seq})`);
        }
        
        return selected;
    }

    async runDemo() {
        console.log('\n══════════════════════════════════════════════════════════════════');
        console.log('                 ⚖️ DIFFICULTY ORACLE DEMO                        ');
        console.log('══════════════════════════════════════════════════════════════════\n');
        
        const testPlayers = [
            { id: 'player-elite-001', profile: 'high skill' },
            { id: 'player-casual-002', profile: 'average skill' },
            { id: 'player-struggling-003', profile: 'needs help' }
        ];
        
        // Simulate 5 game sessions per player
        for (let session = 1; session <= 5; session++) {
            console.log(`\n📅 Session ${session}/5`);
            console.log('──────────────────────────────────────────────────────────────────');
            
            for (const player of testPlayers) {
                let metrics;
                
                // Generate realistic metrics based on player profile
                switch(player.profile) {
                    case 'high skill':
                        metrics = {
                            accuracy: 0.85 + Math.random() * 0.1,
                            kills: 100 + Math.floor(Math.random() * 50),
                            damageTaken: Math.random() * 20,
                            wavesCompleted: 8 + Math.floor(Math.random() * 5)
                        };
                        break;
                    case 'average skill':
                        metrics = {
                            accuracy: 0.6 + Math.random() * 0.15,
                            kills: 60 + Math.floor(Math.random() * 30),
                            damageTaken: 40 + Math.random() * 20,
                            wavesCompleted: 4 + Math.floor(Math.random() * 3)
                        };
                        break;
                    case 'needs help':
                        metrics = {
                            accuracy: 0.3 + Math.random() * 0.15,
                            kills: 30 + Math.floor(Math.random() * 20),
                            damageTaken: 70 + Math.random() * 20,
                            wavesCompleted: 2 + Math.floor(Math.random() * 2)
                        };
                        break;
                }
                
                await this.adjustDifficulty(player.id, metrics);
                
                // Randomly trigger power-ups for struggling players
                if (player.profile === 'needs help' && Math.random() > 0.5) {
                    await this.triggerPowerUp(player.id, 'Player struggling - assistance needed');
                }
                
                await new Promise(r => setTimeout(r, 500));
            }
        }
        
        console.log('\n══════════════════════════════════════════════════════════════════');
        console.log('                    ✅ DEMO COMPLETE                              ');
        console.log('══════════════════════════════════════════════════════════════════\n');
        
        // Summary
        console.log('📊 FINAL PLAYER PROFILES:');
        for (const [playerId, profile] of this.playerProfiles) {
            console.log(`\n   ${playerId}:`);
            console.log(`      Games: ${profile.gamesPlayed}`);
            console.log(`      Avg Accuracy: ${(profile.avgAccuracy * 100).toFixed(1)}%`);
            console.log(`      Difficulty: ${profile.difficultyPreference.toFixed(2)}x`);
            console.log(`      Trend: ${profile.skillTrend.map(v => (v * 100).toFixed(0) + '%').join(' → ')}`);
        }
        
        console.log(`\n📈 Total adjustments made: ${this.adjustmentHistory.length}`);
        
        // Calculate global difficulty trend
        const avgDifficulty = Array.from(this.playerProfiles.values())
            .reduce((sum, p) => sum + p.difficultyPreference, 0) / this.playerProfiles.size;
        console.log(`🌍 Global avg difficulty: ${avgDifficulty.toFixed(2)}x`);
    }
}

// Create agent and run demo
const oracle = new DifficultyOracleAgent();

oracle.runDemo().then(() => {
    console.log('\n🛑 Difficulty Oracle Agent shutting down...');
    client.close();
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    client.close();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Difficulty Oracle Agent stopping...');
    client.close();
    process.exit(0);
});
