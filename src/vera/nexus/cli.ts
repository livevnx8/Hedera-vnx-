#!/usr/bin/env node
/**
 * Vera Nexus CLI
 * 
 * GitNexus-style command-line interface for the Flower of Life lattice.
 * Provides graph exploration, Cypher queries, and lattice intelligence.
 */

import { latticeGraph, QueryResult } from './latticeGraph.js';
import { harmonicResonator } from '../lattice/harmonicResonator.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Vera Nexus CLI - Flower of Life Lattice Intelligence    ║
╚══════════════════════════════════════════════════════════╝

Commands:
  query "<cypher>"     Execute Cypher query on lattice
  path <from> <to>   Find shortest path between nodes
  graph              Export full lattice graph (JSON)
  stats              Show lattice statistics
  pulse              Trigger center-0 pulse
  neighbors <node>   Show connected nodes
  popular            Show most traveled paths
  visualize          Generate Mermaid diagram
  help               Show this help

Examples:
  nexus query "MATCH (n:layer1) WHERE n.energy > 0.7 RETURN n"
  nexus path center-0 layer3-2
  nexus neighbors center-0
  nexus pulse
`);
}

function executeQuery(query: string): void {
  console.log(`\n🔍 Executing: ${query}\n`);
  
  const result = latticeGraph.query(query);
  
  console.log(`⏱️  Execution time: ${result.executionTime}ms`);
  console.log(`📊 Found ${result.nodes.length} nodes, ${result.edges.length} edges\n`);
  
  if (result.nodes.length === 0) {
    console.log('❌ No results');
    return;
  }
  
  console.log('┌─────────┬─────────────────────┬────────┬───────────┬────────┐');
  console.log('│ ID      │ Label               │ Type   │ Energy    │ Freq   │');
  console.log('├─────────┼─────────────────────┼────────┼───────────┼────────┤');
  
  for (const node of result.nodes.slice(0, 20)) {
    const id = node.id.padEnd(9).slice(0, 9);
    const label = node.label.padEnd(19).slice(0, 19);
    const type = node.type.padEnd(6).slice(0, 6);
    const energy = node.energy.toFixed(2).padStart(9);
    const freq = node.frequency.toString().padStart(6);
    console.log(`│ ${id} │ ${label} │ ${type} │ ${energy} │ ${freq} │`);
  }
  
  if (result.nodes.length > 20) {
    console.log(`│ ...     │ (${result.nodes.length - 20} more rows)      │        │           │        │`);
  }
  
  console.log('└─────────┴─────────────────────┴────────┴───────────┴────────┘');
}

function findPath(from: string, to: string): void {
  console.log(`\n🛤️  Finding path: ${from} → ${to}\n`);
  
  const path = latticeGraph.findPath(from, to);
  
  if (path.length === 0) {
    console.log('❌ No path found');
    return;
  }
  
  console.log('📍 Path found:\n');
  
  for (let i = 0; i < path.length; i++) {
    const node = latticeGraph.getNode(path[i])!;
    const prefix = i === 0 ? '┌─►' : i === path.length - 1 ? '└─►' : '├─►';
    const energy = '█'.repeat(Math.floor(node.energy * 10));
    console.log(`${prefix} ${node.id.padEnd(12)} ${node.label.padEnd(20)} [${energy}] ${node.energy.toFixed(2)}`);
    
    if (i < path.length - 1) {
      const edge = node.connections.includes(path[i + 1]);
      if (edge) {
        const edgeData = latticeGraph['edges'].get(`${node.id}→${path[i + 1]}`);
        if (edgeData) {
          console.log(`    │ ${edgeData.type} (${(edgeData.strength * 100).toFixed(0)}%)`);
        }
      }
    }
  }
  
  console.log(`\n📏 Total hops: ${path.length - 1}`);
  console.log(`🔢 Nodes visited: ${path.length}`);
}

function showGraph(): void {
  const graph = latticeGraph.exportGraph();
  
  console.log('\n📊 Lattice Graph Export\n');
  console.log(JSON.stringify(graph, null, 2));
}

function showStats(): void {
  const graph = latticeGraph.exportGraph();
  
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Flower of Life Lattice Statistics                       ║
╚══════════════════════════════════════════════════════════╝

🌸 Structure:
   Nodes:        ${graph.nodes.length}
   Edges:        ${graph.edges.length}
   Layers:       4 (center + 3 rings)
   Center:       center-0

⚡ Energy Status:
   Center:       ${graph.centerEnergy.toFixed(3)}
   Coherence:    ${(graph.globalCoherence * 100).toFixed(1)}%
   Harmonics:    ${harmonicResonator.getResonanceData().state.balance.toFixed(2)}

📈 Node Distribution:
   Center:       ${latticeGraph.getNodesByType('center').length}
   Layer 1:      ${latticeGraph.getNodesByType('layer1').length}
   Layer 2:      ${latticeGraph.getNodesByType('layer2').length}
   Layer 3:      ${latticeGraph.getNodesByType('layer3').length}
   Inner:        ${latticeGraph.getNodesByType('inner').length}
   Outer:        ${latticeGraph.getNodesByType('outer').length}

🔮 Sacred Frequencies:
   Center:       432 Hz (consciousness)
   Layer 1:      528 Hz (transformation)
   Layer 2:      639 Hz (connection)
   Layer 3:      741 Hz (expression)
   Inner:        963 Hz (divine)
   Outer:        852 Hz (spiritual order)
`);
}

function triggerPulse(): void {
  console.log('\n⚡ Triggering Center-0 Pulse\n');
  
  const resonator = harmonicResonator.getResonanceData();
  console.log('🔔 Pulse initiated at center-0');
  console.log(`📊 Current coherence: ${(resonator.state.coherence * 100).toFixed(1)}%`);
  console.log(`⚡ Balance: ${resonator.state.balance.toFixed(2)} φ`);
  
  // Simulate pulse propagation
  const nodes = ['center-0', 'layer1-0', 'layer2-0', 'layer3-0', 'center-0'];
  console.log('\n🌊 Propagation path:');
  for (let i = 0; i < nodes.length; i++) {
    setTimeout(() => {
      const bar = '█'.repeat(i + 1) + '░'.repeat(nodes.length - i - 1);
      process.stdout.write(`\r   ${bar} ${nodes[i]}`);
      if (i === nodes.length - 1) {
        console.log('\n\n✅ Pulse complete');
      }
    }, i * 200);
  }
}

function showNeighbors(nodeId: string): void {
  const node = latticeGraph.getNode(nodeId);
  if (!node) {
    console.log(`❌ Node not found: ${nodeId}`);
    return;
  }
  
  console.log(`\n🔗 Neighbors of ${nodeId}\n`);
  
  const neighbors = latticeGraph.getNeighbors(nodeId);
  
  console.log(`┌─────────────┬─────────────────────┬────────┬────────┐`);
  console.log(`│ ID          │ Label               │ Type   │ Edge   │`);
  console.log(`├─────────────┼─────────────────────┼────────┼────────┤`);
  
  for (const neighbor of neighbors) {
    const edgeId = `${nodeId}→${neighbor.id}`;
    const edge = latticeGraph['edges'].get(edgeId) || latticeGraph['edges'].get(`${neighbor.id}→${nodeId}`);
    const edgeType = edge ? `${edge.type}(${(edge.strength * 100).toFixed(0)}%)` : 'none';
    
    console.log(`│ ${neighbor.id.padEnd(11)} │ ${neighbor.label.padEnd(19)} │ ${neighbor.type.padEnd(6)} │ ${edgeType.padEnd(6)} │`);
  }
  
  console.log(`└─────────────┴─────────────────────┴────────┴────────┘`);
  console.log(`\n📊 Total neighbors: ${neighbors.length}`);
}

function showPopularPaths(): void {
  const paths = latticeGraph.getPopularPaths(10);
  
  console.log('\n🔥 Most Traveled Paths\n');
  
  if (paths.length === 0) {
    console.log('No recorded paths yet.');
    return;
  }
  
  console.log(`┌──────┬───────────────────────────────────────┬────────┬──────────┐`);
  console.log(`│ Rank │ Path                                  │ Visits │ Avg Energy│`);
  console.log(`├──────┼───────────────────────────────────────┼────────┼──────────┤`);
  
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const pathStr = path.path.join(' → ').padEnd(37).slice(0, 37);
    const rank = (i + 1).toString().padStart(4);
    const visits = path.count.toString().padStart(6);
    const energy = path.avgEnergy.toFixed(2).padStart(9);
    console.log(`│ ${rank} │ ${pathStr} │ ${visits} │ ${energy} │`);
  }
  
  console.log(`└──────┴───────────────────────────────────────┴────────┴──────────┘`);
}

function generateMermaid(): void {
  console.log('\n📊 Mermaid Graph Visualization\n');
  console.log('```mermaid');
  console.log('graph TD');
  
  const graph = latticeGraph.exportGraph();
  
  // Add nodes
  for (const node of graph.nodes) {
    const style = node.type === 'center' ? '(((' + node.label + ')))' :
                  node.type === 'inner' ? '((' + node.label + '))' :
                  node.type === 'outer' ? '[' + node.label + ']' :
                  '(' + node.label + ')';
    console.log(`    ${node.id}${style}`);
  }
  
  // Add edges
  for (const edge of graph.edges) {
    const style = edge.type === 'resonance' ? '==>' :
                  edge.type === 'entrainment' ? '-.->' :
                  '-->';
    console.log(`    ${edge.source} ${style}|${edge.strength}| ${edge.target}`);
  }
  
  // Styling
  console.log('    style center-0 fill:#a78bfa,stroke:#667eea,stroke-width:3px');
  console.log('    style inner-0 fill:#f472b6,stroke:#ec4899');
  console.log('    style outer-0 fill:#22d3ee,stroke:#06b6d4');
  
  console.log('```');
}

// Main CLI handler
async function main() {
  switch (command) {
    case 'query':
      if (!args[1]) {
        console.log('❌ Missing query. Example: nexus query "MATCH (n:layer1) RETURN n"');
        process.exit(1);
      }
      executeQuery(args[1]);
      break;
      
    case 'path':
      if (!args[1] || !args[2]) {
        console.log('❌ Missing nodes. Example: nexus path center-0 layer3-2');
        process.exit(1);
      }
      findPath(args[1], args[2]);
      break;
      
    case 'graph':
      showGraph();
      break;
      
    case 'stats':
      showStats();
      break;
      
    case 'pulse':
      triggerPulse();
      break;
      
    case 'neighbors':
      if (!args[1]) {
        console.log('❌ Missing node ID. Example: nexus neighbors center-0');
        process.exit(1);
      }
      showNeighbors(args[1]);
      break;
      
    case 'popular':
      showPopularPaths();
      break;
      
    case 'visualize':
      generateMermaid();
      break;
      
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch(console.error);
