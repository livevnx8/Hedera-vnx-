#!/usr/bin/env node
// Trace the agent startup

import { VeraAgent } from './blueprints/agent-base.mjs';

console.log('1. Starting test...');

class TestAgent extends VeraAgent {
  constructor() {
    console.log('2. In constructor...');
    super({
      id: 'test-001',
      type: 'TEST',
      version: '1.0.0',
      credentials: {
        accountId: '0.0.10294360',
        key: process.env.HEDERA_OPERATOR_PRIVATE_KEY
      },
      topics: { CORE: '0.0.10409351' },
      cycleInterval: 5000
    });
    console.log('3. Constructor complete');
  }
  
  async performWork() {
    console.log('4. performWork called');
    console.log('   Cycles:', this.state.cycles);
    console.log('5. performWork done');
  }
}

console.log('6. Creating agent...');
const agent = new TestAgent();
console.log('7. Agent created, starting...');
agent.start();
console.log('8. Agent started, waiting...');

// Exit after 3 seconds
setTimeout(() => {
  console.log('9. Done');
  process.exit(0);
}, 3000);
