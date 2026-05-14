/**
 * Metatron's Cube Generator
 *
 * Metatron's Cube is formed from the 13 circles of the Fruit of Life pattern
 * (center + 12 surrounding from the Flower of Life), with lines connecting
 * all circle centers to form the complete cube.
 *
 * Contains the 5 Platonic solids:
 * - Tetrahedron (fire)
 * - Cube/Hexahedron (earth)
 * - Octahedron (air)
 * - Dodecahedron (ether/spirit)
 * - Icosahedron (water)
 */

import { logger } from '../../monitoring/logger.js';
import { flowerOfLifeGenerator, FlowerOfLifeConfig } from './flowerOfLife.js';

export interface MetatronNode {
  id: string;
  x: number;
  y: number;
  z: number;
  type: 'center' | 'inner' | 'outer';
}

export interface MetatronLine {
  from: string;
  to: string;
  type: 'axis' | 'diagonal' | 'face' | 'platonic';
}

export interface PlatonicSolid {
  name: string;
  vertices: string[]; // Node IDs
  faces: Array<{ vertices: string[] }>;
  color: string;
}

export interface MetatronCubeGeometry {
  nodes: MetatronNode[];
  lines: MetatronLine[];
  platonicSolids: PlatonicSolid[];
  circles: Array<{ cx: number; cy: number; r: number }>;
  boundingBox: { min: number; max: number };
}

export interface MetatronConfig extends Omit<FlowerOfLifeConfig, 'petals'> {
  includePlatonicSolids?: boolean;
  highlightSolids?: string[]; // Names of solids to highlight
}

export class MetatronCubeGenerator {
  /**
   * Generate Metatron's Cube from 13 circles of Fruit of Life
   */
  generate(config: MetatronConfig = {}): MetatronCubeGeometry {
    const { includePlatonicSolids = true, highlightSolids = [] } = config;

    // Generate Fruit of Life (2 rings = 1 + 6 + 6 = 13 circles)
    const flower = flowerOfLifeGenerator.generate({ ...config, petals: 2 });

    // Convert 2D circles to 3D nodes (z=0 for flat projection)
    const nodes: MetatronNode[] = flower.circles.map((c) => ({
      id: c.id,
      x: c.cx,
      y: c.cy,
      z: 0,
      type: c.ring === 0 ? 'center' : c.ring === 1 ? 'inner' : 'outer',
    }));

    // Generate all connecting lines between nodes
    const lines = this.generateLines(nodes);

    // Generate Platonic solids
    const platonicSolids = includePlatonicSolids
      ? this.generatePlatonicSolids(nodes, highlightSolids)
      : [];

    // Calculate bounding box
    const coords = nodes.flatMap((n) => [n.x, n.y]);
    const boundingBox = {
      min: Math.min(...coords) - flower.radius,
      max: Math.max(...coords) + flower.radius,
    };

    logger.debug('MetatronCubeGenerator', {
      message: 'Generated Metatron\'s Cube',
      nodes: nodes.length,
      lines: lines.length,
      solids: platonicSolids.length,
    });

    return {
      nodes,
      lines,
      platonicSolids,
      circles: flower.circles.map((c) => ({ cx: c.cx, cy: c.cy, r: c.r })),
      boundingBox,
    };
  }

  /**
   * Generate all 78 connecting lines between the 13 nodes
   */
  private generateLines(nodes: MetatronNode[]): MetatronLine[] {
    const lines: MetatronLine[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];

        // Classify line type based on node positions
        const type = this.classifyLine(n1, n2);

        lines.push({
          from: n1.id,
          to: n2.id,
          type,
        });
      }
    }

    return lines;
  }

  /**
   * Classify a line based on geometric relationship
   */
  private classifyLine(n1: MetatronNode, n2: MetatronNode): MetatronLine['type'] {
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Find the center node
    const centerNode = n1.type === 'center' ? n1 : n2.type === 'center' ? n2 : null;

    if (centerNode) {
      // Lines from center are axes
      const otherNode = n1.id === centerNode.id ? n2 : n1;

      // Check if other node is inner ring (seed of life)
      if (otherNode.type === 'inner') {
        // These are the 6 main axes
        return 'axis';
      }
    }

    // Check distance for face diagonals vs space diagonals
    // In a perfect hexagonal grid, distances form specific ratios
    const normalizedDist = dist / 50; // Assuming radius of 50

    if (Math.abs(normalizedDist - 1) < 0.1) {
      return 'face'; // Edge of a face
    } else if (Math.abs(normalizedDist - Math.sqrt(2)) < 0.1) {
      return 'diagonal'; // Face diagonal
    }

    return 'diagonal';
  }

  /**
   * Generate the 5 Platonic solids within Metatron's Cube
   */
  private generatePlatonicSolids(
    nodes: MetatronNode[],
    highlightSolids: string[]
  ): PlatonicSolid[] {
    const solids: PlatonicSolid[] = [];

    // Map node IDs to indices for easier reference
    const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));
    const getNode = (id: string) => nodes[nodeMap.get(id)!];

    const center = nodes.find((n) => n.type === 'center')!;
    const inner = nodes.filter((n) => n.type === 'inner');
    const outer = nodes.filter((n) => n.type === 'outer');

    // 1. Tetrahedron (4 vertices)
    // Formed from center + 3 alternating inner ring nodes
    if (inner.length >= 3) {
      solids.push({
        name: 'tetrahedron',
        vertices: [center.id, inner[0].id, inner[2].id, inner[4].id],
        faces: [
          { vertices: [center.id, inner[0].id, inner[2].id] },
          { vertices: [center.id, inner[2].id, inner[4].id] },
          { vertices: [center.id, inner[4].id, inner[0].id] },
          { vertices: [inner[0].id, inner[2].id, inner[4].id] },
        ],
        color: highlightSolids.includes('tetrahedron') ? '#ff5722' : '#ff8a65',
      });
    }

    // 2. Cube/Hexahedron (8 vertices)
    // Requires projecting to 3D or selecting appropriate nodes
    // For 2D representation, we use a subset
    if (inner.length >= 4 && outer.length >= 4) {
      const cubeVertices = [
        inner[0].id,
        inner[1].id,
        inner[2].id,
        inner[3].id,
        outer[0].id,
        outer[2].id,
        outer[4].id,
        outer[6].id,
      ];

      solids.push({
        name: 'cube',
        vertices: cubeVertices,
        faces: [
          { vertices: [inner[0].id, inner[1].id, inner[2].id, inner[3].id] },
          { vertices: [outer[0].id, outer[2].id, outer[4].id, outer[6].id] },
        ],
        color: highlightSolids.includes('cube') ? '#4caf50' : '#81c784',
      });
    }

    // 3. Octahedron (6 vertices)
    // Dual of cube - formed from face centers
    if (inner.length >= 6) {
      solids.push({
        name: 'octahedron',
        vertices: inner.slice(0, 6).map((n) => n.id),
        faces: [
          { vertices: [inner[0].id, inner[1].id, inner[2].id] },
          { vertices: [inner[0].id, inner[4].id, inner[5].id] },
          { vertices: [inner[2].id, inner[3].id, inner[4].id] },
          { vertices: [inner[1].id, inner[2].id, inner[3].id] },
          { vertices: [inner[3].id, inner[4].id, inner[5].id] },
          { vertices: [inner[0].id, inner[1].id, inner[5].id] },
          { vertices: [inner[0].id, inner[2].id, inner[4].id] },
          { vertices: [inner[1].id, inner[3].id, inner[5].id] },
        ],
        color: highlightSolids.includes('octahedron') ? '#2196f3' : '#64b5f6',
      });
    }

    // 4. Dodecahedron (12 vertices)
    // Requires careful node selection from the pattern
    if (outer.length >= 12) {
      solids.push({
        name: 'dodecahedron',
        vertices: outer.map((n) => n.id),
        faces: [], // Complex pentagonal faces
        color: highlightSolids.includes('dodecahedron') ? '#9c27b0' : '#ba68c8',
      });
    }

    // 5. Icosahedron (20 vertices)
    // Would require more nodes or 3D projection
    // Simplified version using available nodes
    const icosaVertices = [...inner.map((n) => n.id), ...outer.slice(0, 12).map((n) => n.id)];
    if (icosaVertices.length >= 12) {
      solids.push({
        name: 'icosahedron',
        vertices: icosaVertices.slice(0, 12),
        faces: [],
        color: highlightSolids.includes('icosahedron') ? '#00bcd4' : '#4dd0e1',
      });
    }

    return solids;
  }
}

export const metatronCubeGenerator = new MetatronCubeGenerator();
export default metatronCubeGenerator;
