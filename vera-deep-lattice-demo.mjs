import { VeraEnhancedResponseGenerator } from './dist/chat/vera-deep-lattice-chat.js';

const vera = new VeraEnhancedResponseGenerator();

console.log('═'.repeat(70));
console.log('VERA DEEP LATTICE CHAT v3.0 - DEMO');
console.log('═'.repeat(70));

const queries = [
  'What is the meaning of building on Hedera?',
  'How do I maximize returns in DeFi?',
  'Should I offset my carbon footprint?',
  'Explain the technical architecture'
];

for (const query of queries) {
  console.log(`\n👤 User: "${query}"\n`);
  const response = vera.generate(query, [], { philosophical: true });
  console.log(`🧠 Vera:\n${response.text.slice(0, 300)}...`);
  console.log(`\n📊 Metadata:`, JSON.stringify(response.metadata, null, 2));
  vera.storeMemory(query, 'user');
  vera.storeMemory(response.text, 'assistant');
}
