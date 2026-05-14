/**
 * Vera Lattice Coherence Visualizer
 * 
 * Generates visual representations of the lattice state for monitoring
 * and debugging. Produces graph data for field coherence, entanglements,
 * and routing decisions.
 * 
 * Output formats:
 * - GraphViz DOT format for rendering
 * - JSON graph structure for D3/vis.js
 * - ASCII art for console display
 * - Mermaid syntax for documentation
 */

import { latticeManager } from '../lattice/core/LatticeManager.js';
import { logger } from '../../monitoring/logger.js';

export interface GraphNode {
  id: string;
  label: string;
  type: 'field' | 'node' | 'entanglement' | 'agent';
  x?: number;
  y?: number;
  color?: string;
  size?: number;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  weight: number;
  color?: string;
  dashed?: boolean;
}

export interface LatticeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  timestamp: number;
  coherence: number;
}

export class LatticeVisualizer {
  /**
   * Generate a complete graph representation of the lattice
   */
  generateGraph(): LatticeGraph {
    const state = latticeManager.exportState();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Add field nodes
    const fields = state.fields as Record<string, any>;
    for (const [fieldId, fieldData] of Object.entries(fields)) {
      nodes.push({
        id: fieldId,
        label: fieldData.name || fieldId,
        type: 'field',
        color: this.getFieldColor(fieldId),
        size: 30 + (fieldData.nodes?.length || 0) * 2,
        metadata: {
          coherence: fieldData.coherence,
          dimensions: fieldData.dimensions,
          nodeCount: fieldData.nodes?.length || 0
        }
      });

      // Add reasoning nodes within each field
      const fieldNodes = fieldData.nodes || [];
      for (const node of fieldNodes) {
        const nodeId = `${fieldId}:${node.id}`;
        nodes.push({
          id: nodeId,
          label: node.hypothesis?.slice(0, 20) || node.id,
          type: 'node',
          color: this.getNodeColor(node.state, node.confidence),
          size: 10 + (node.confidence || 0.5) * 20,
          metadata: {
            state: node.state,
            confidence: node.confidence,
            field: fieldId,
            entangledWith: node.entangledWith
          }
        });

        // Connect node to its field
        edges.push({
          source: fieldId,
          target: nodeId,
          weight: 1,
          color: '#cccccc'
        });

        // Add entanglements
        if (node.entangledWith) {
          for (const entangledId of node.entangledWith) {
            edges.push({
              source: nodeId,
              target: entangledId.includes(':') ? entangledId : `${fieldId}:${entangledId}`,
              weight: 2,
              color: '#ff6b6b',
              label: 'entangled'
            });
          }
        }
      }
    }

    // Add cross-field entanglements
    const crossField = state.crossFieldEntanglements as Record<string, string[]>;
    for (const [key, entangledList] of Object.entries(crossField)) {
      const [field1, field2] = key.split(':');
      if (field1 && field2) {
        edges.push({
          source: field1,
          target: field2,
          weight: 3,
          color: '#4ecdc4',
          label: `entanglements: ${entangledList.length}`,
          dashed: true
        });
      }
    }

    return {
      nodes,
      edges,
      timestamp: Date.now(),
      coherence: latticeManager.getSystemCoherence()
    };
  }

  /**
   * Generate GraphViz DOT format for rendering
   */
  toDOT(graph?: LatticeGraph): string {
    const g = graph || this.generateGraph();
    
    let dot = 'digraph Lattice {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=rounded];\n\n';

    // Group nodes by type
    const fields = g.nodes.filter(n => n.type === 'field');
    const nodes = g.nodes.filter(n => n.type === 'node');

    // Add field subgraphs
    for (const field of fields) {
      dot += `  subgraph cluster_${field.id} {\n`;
      dot += `    label="${field.label} (coherence: ${(field.metadata.coherence as number)?.toFixed(2) || 0.5})";\n`;
      dot += `    color="${field.color || '#333333'}";\n`;
      dot += `    style=filled;\n`;
      dot += `    fillcolor="${this.lightenColor(field.color || '#333333', 0.9)}";\n\n`;

      // Add nodes belonging to this field
      const fieldNodes = nodes.filter(n => (n.metadata.field as string) === field.id);
      for (const node of fieldNodes) {
        dot += `    "${node.id}" [label="${node.label}", fillcolor="${node.color || '#ffffff'}", width=${((node.size || 10) / 20).toFixed(1)}];\n`;
      }

      dot += '  }\n\n';
    }

    // Add edges
    for (const edge of g.edges) {
      const style = edge.dashed ? ' [style=dashed]' : '';
      const label = edge.label ? ` [label="${edge.label}"]` : '';
      const color = edge.color ? ` [color="${edge.color}"]` : '';
      dot += `  "${edge.source}" -> "${edge.target}"${style}${label}${color};\n`;
    }

    dot += '}\n';
    return dot;
  }

  /**
   * Generate Mermaid diagram syntax
   */
  toMermaid(graph?: LatticeGraph): string {
    const g = graph || this.generateGraph();
    
    let mermaid = 'graph TD\n';

    // Add nodes with styles
    for (const node of g.nodes) {
      if (node.type === 'field') {
        mermaid += `  ${node.id}[${node.label}]:::field\n`;
      } else {
        mermaid += `  ${node.id}["${node.label}"]:::node\n`;
      }
    }

    mermaid += '\n';

    // Add connections
    for (const edge of g.edges) {
      const style = edge.dashed ? '-.-' : '-->';
      const label = edge.label ? `|${edge.label}|` : '';
      mermaid += `  ${edge.source} ${style}${label} ${edge.target}\n`;
    }

    // Add class definitions
    mermaid += '\n';
    mermaid += '  classDef field fill:#4ecdc4,stroke:#333,stroke-width:2px;\n';
    mermaid += '  classDef node fill:#95e1d3,stroke:#333,stroke-width:1px;\n';

    return mermaid;
  }

  /**
   * Generate ASCII art representation for console
   */
  toASCII(graph?: LatticeGraph): string {
    const g = graph || this.generateGraph();
    
    let ascii = `╔════════════════════════════════════════╗\n`;
    ascii += `║     VERA LATTICE COHERENCE: ${(g.coherence * 100).toFixed(1)}%     ║\n`;
    ascii += `╚════════════════════════════════════════╝\n\n`;

    const fields = g.nodes.filter(n => n.type === 'field');
    
    for (const field of fields) {
      const coherence = (field.metadata.coherence as number) || 0.5;
      const barLength = Math.round(coherence * 20);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      
      ascii += `${field.label}\n`;
      ascii += `[${bar}] ${(coherence * 100).toFixed(1)}%\n`;
      
      const fieldNodes = g.nodes.filter(n => 
        n.type === 'node' && (n.metadata.field as string) === field.id
      );
      
      ascii += `  Nodes: ${fieldNodes.length}\n`;
      
      const entangled = fieldNodes.filter(n => 
        (n.metadata.entangledWith as string[])?.length > 0
      ).length;
      
      if (entangled > 0) {
        ascii += `  Entangled: ${entangled}\n`;
      }
      
      ascii += '\n';
    }

    const crossFieldEdges = g.edges.filter(e => e.dashed);
    if (crossFieldEdges.length > 0) {
      ascii += `Cross-Field Entanglements: ${crossFieldEdges.length}\n`;
      for (const edge of crossFieldEdges.slice(0, 5)) {
        ascii += `  ${edge.source} ↔ ${edge.target}\n`;
      }
    }

    return ascii;
  }

  /**
   * Generate JSON for D3.js force-directed graph
   */
  toD3JSON(graph?: LatticeGraph): string {
    const g = graph || this.generateGraph();
    return JSON.stringify({
      nodes: g.nodes.map(n => ({
        id: n.id,
        group: n.type,
        label: n.label,
        size: n.size,
        color: n.color,
        ...n.metadata
      })),
      links: g.edges.map(e => ({
        source: e.source,
        target: e.target,
        value: e.weight,
        color: e.color
      }))
    }, null, 2);
  }

  /**
   * Generate coherence heatmap data
   */
  generateHeatmapData(): {
    fields: string[];
    nodes: string[];
    coherence: number[][];
  } {
    const state = latticeManager.exportState();
    const fields = Object.keys(state.fields as Record<string, any>);
    
    const allNodes: string[] = [];
    const coherence: number[][] = [];

    for (const fieldId of fields) {
      const fieldData = (state.fields as Record<string, any>)[fieldId];
      const nodes = fieldData.nodes || [];
      
      for (const node of nodes) {
        allNodes.push(`${fieldId}:${node.id}`);
      }
    }

    // Build coherence matrix
    for (let i = 0; i < allNodes.length; i++) {
      coherence[i] = [];
      for (let j = 0; j < allNodes.length; j++) {
        if (i === j) {
          coherence[i][j] = 1;
        } else {
          // Calculate coherence based on entanglements
          const node1 = this.findNode(allNodes[i], state);
          const node2 = this.findNode(allNodes[j], state);
          
          if (node1?.entangledWith?.includes(allNodes[j]) ||
              node2?.entangledWith?.includes(allNodes[i])) {
            coherence[i][j] = 0.8;
          } else {
            coherence[i][j] = 0.1;
          }
        }
      }
    }

    return { fields, nodes: allNodes, coherence };
  }

  /**
   * Get HTML widget for embedding in dashboards
   */
  getHTMLWidget(width = 800, height = 600): string {
    const graph = this.generateGraph();
    const d3Data = this.toD3JSON(graph);
    
    return `
<!DOCTYPE html>
<html>
<head>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    #lattice-viz { width: ${width}px; height: ${height}px; border: 1px solid #ccc; }
    .node { stroke: #fff; stroke-width: 1.5px; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    .field-label { font-weight: bold; font-size: 14px; }
  </style>
</head>
<body>
  <div id="lattice-viz"></div>
  <script>
    const data = ${d3Data};
    
    const svg = d3.select("#lattice-viz").append("svg")
      .attr("width", ${width})
      .attr("height", ${height});
    
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(${width / 2}, ${height / 2}));
    
    const link = svg.append("g")
      .selectAll("line")
      .data(data.links)
      .enter().append("line")
      .attr("class", "link")
      .attr("stroke-width", d => Math.sqrt(d.value));
    
    const node = svg.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .enter().append("circle")
      .attr("class", "node")
      .attr("r", d => d.size || 10)
      .attr("fill", d => d.color || "#69b3a2")
      .call(d3.drag());
    
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
    });
  </script>
</body>
</html>`;
  }

  // Private helpers

  private getFieldColor(fieldId: string): string {
    const colors: Record<string, string> = {
      'verification': '#4ecdc4',
      'economic': '#ffe66d',
      'security': '#ff6b6b',
      'performance': '#95e1d3'
    };
    return colors[fieldId] || '#a8d8ea';
  }

  private getNodeColor(state: string, confidence: number): string {
    if (state === 'collapsed') {
      return confidence > 0.8 ? '#2ecc71' : '#f39c12';
    }
    if (state === 'superposed') {
      return '#9b59b6';
    }
    return '#95a5a6';
  }

  private lightenColor(color: string, factor: number): string {
    // Simple hex color lightening
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  private findNode(nodeId: string, state: Record<string, unknown>): any {
    const [fieldId, id] = nodeId.split(':');
    const fields = state.fields as Record<string, any>;
    const field = fields?.[fieldId];
    return field?.nodes?.find((n: any) => n.id === id);
  }
}

// Singleton instance
export const latticeVisualizer = new LatticeVisualizer();
export default latticeVisualizer;
