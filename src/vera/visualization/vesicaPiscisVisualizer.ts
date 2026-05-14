/**
 * Vesica Piscis Lattice Visualization
 *
 * Renders the sacred geometry pattern shown in the drawing:
 * - Two overlapping circles (vesica piscis formation)
 * - Center point with radial connections to 6 cardinal points
 * - Triangular mesh overlay
 * - Compass construction guides
 */

import { logger } from '../../monitoring/logger.js';

export interface VesicaPiscisNode {
  id: string;
  x: number;
  y: number;
  type: 'center' | 'cardinal' | 'intersection' | 'outer';
  label: string;
}

export interface VesicaPiscisConnection {
  from: string;
  to: string;
  type: 'radius' | 'chord' | 'triangle' | 'vesica';
}

export interface VesicaPiscisGeometry {
  nodes: VesicaPiscisNode[];
  connections: VesicaPiscisConnection[];
  circles: Array<{
    cx: number;
    cy: number;
    r: number;
    label: string;
  }>;
  vesicaPoints: {
    top: { x: number; y: number };
    bottom: { x: number; y: number };
  };
  construction: {
    compassAngle: number;
    intersections: Array<{ x: number; y: number; label: string }>;
  };
}

export class VesicaPiscisVisualizer {
  private radius = 100;
  private centerX = 150;
  private centerY = 150;

  /**
   * Generate the sacred geometry visualization matching the drawing
   */
  generateGeometry(): VesicaPiscisGeometry {
    const nodes: VesicaPiscisNode[] = [];
    const connections: VesicaPiscisConnection[] = [];
    const intersections: Array<{ x: number; y: number; label: string }> = [];

    // Center point (labeled 'h' in drawing)
    const centerId = 'center-h';
    nodes.push({
      id: centerId,
      x: this.centerX,
      y: this.centerY,
      type: 'center',
      label: 'h',
    });

    // Left circle center (labeled 's')
    const leftCenterX = this.centerX - this.radius / 2;
    const leftCenterId = 'left-center-s';
    nodes.push({
      id: leftCenterId,
      x: leftCenterX,
      y: this.centerY,
      type: 'intersection',
      label: 's',
    });

    // Right circle center (labeled 'G' in drawing)
    const rightCenterX = this.centerX + this.radius / 2;
    const rightCenterId = 'right-center-G';
    nodes.push({
      id: rightCenterId,
      x: rightCenterX,
      y: this.centerY,
      type: 'intersection',
      label: 'G',
    });

    // 6 cardinal points on main circle (0°, 60°, 120°, 180°, 240°, 300°)
    const cardinals = [
      { angle: 0, label: '0°', id: 'cardinal-0' },
      { angle: 60, label: '60°', id: 'cardinal-60' },
      { angle: 120, label: '120°', id: 'cardinal-120' },
      { angle: 180, label: '180°', id: 'cardinal-180' },
      { angle: 240, label: '240°', id: 'cardinal-240' },
      { angle: 300, label: '300°', id: 'cardinal-300' },
    ];

    for (const card of cardinals) {
      const rad = (card.angle * Math.PI) / 180;
      const x = this.centerX + this.radius * Math.cos(rad);
      const y = this.centerY + this.radius * Math.sin(rad);

      nodes.push({
        id: card.id,
        x,
        y,
        type: 'cardinal',
        label: card.label,
      });

      // Radial connection from center to cardinal
      connections.push({
        from: centerId,
        to: card.id,
        type: 'radius',
      });

      // Store for intersections
      if (card.angle === 120 || card.angle === 240) {
        intersections.push({ x, y, label: card.label });
      }
    }

    // Vesica piscis intersection points (top and bottom of the lens)
    const vesicaHeight = (Math.sqrt(3) / 2) * this.radius;
    const vesicaTop = {
      x: this.centerX,
      y: this.centerY - vesicaHeight,
    };
    const vesicaBottom = {
      x: this.centerX,
      y: this.centerY + vesicaHeight,
    };

    // Add outer circle points (the expanded vesica)
    const outerPoints = [
      { x: leftCenterX - this.radius, y: this.centerY, label: '1', id: 'outer-1' },
      { x: rightCenterX + this.radius, y: this.centerY, label: '2', id: 'outer-2' },
    ];

    for (const pt of outerPoints) {
      nodes.push({
        id: pt.id,
        x: pt.x,
        y: pt.y,
        type: 'outer',
        label: pt.label,
      });

      // Connect to nearest center
      const nearestCenter = pt.x < this.centerX ? leftCenterId : rightCenterId;
      connections.push({
        from: nearestCenter,
        to: pt.id,
        type: 'radius',
      });
    }

    // Triangular connections (chords)
    const trianglePairs = [
      ['cardinal-0', 'cardinal-120'],
      ['cardinal-120', 'cardinal-240'],
      ['cardinal-240', 'cardinal-0'],
      ['cardinal-60', 'cardinal-180'],
      ['cardinal-180', 'cardinal-300'],
      ['cardinal-300', 'cardinal-60'],
    ];

    for (const [from, to] of trianglePairs) {
      connections.push({
        from,
        to,
        type: 'triangle',
      });
    }

    // Vesica piscis connections
    connections.push({
      from: leftCenterId,
      to: rightCenterId,
      type: 'vesica',
    });

    logger.debug('VesicaPiscisVisualizer', {
      message: 'Generated sacred geometry',
      nodes: nodes.length,
      connections: connections.length,
    });

    return {
      nodes,
      connections,
      circles: [
        { cx: leftCenterX, cy: this.centerY, r: this.radius, label: 'Circle S' },
        { cx: rightCenterX, cy: this.centerY, r: this.radius, label: 'Circle G' },
        { cx: this.centerX, cy: this.centerY, r: this.radius, label: 'Main Circle' },
      ],
      vesicaPoints: {
        top: vesicaTop,
        bottom: vesicaBottom,
      },
      construction: {
        compassAngle: 60,
        intersections,
      },
    };
  }

  /**
   * Generate SVG visualization
   */
  generateSVG(): string {
    const geometry = this.generateGeometry();
    const width = 300;
    const height = 300;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `  <defs>\n`;
    svg += `    <style>\n`;
    svg += `      .circle { fill: none; stroke: #4a90d9; stroke-width: 2; opacity: 0.6; }\n`;
    svg += `      .radius { stroke: #7cb342; stroke-width: 1; opacity: 0.4; }\n`;
    svg += `      .triangle { stroke: #f57c00; stroke-width: 1.5; opacity: 0.5; }\n`;
    svg += `      .vesica { stroke: #e91e63; stroke-width: 2; stroke-dasharray: 5,5; }\n`;
    svg += `      .node { fill: #333; }\n`;
    svg += `      .label { font-family: serif; font-size: 14px; fill: #333; }\n`;
    svg += `    </style>\n`;
    svg += `  </defs>\n`;

    // Draw circles
    for (const circle of geometry.circles) {
      svg += `  <circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" class="circle" />\n`;
    }

    // Draw connections
    for (const conn of geometry.connections) {
      const fromNode = geometry.nodes.find((n) => n.id === conn.from)!;
      const toNode = geometry.nodes.find((n) => n.id === conn.to)!;
      svg += `  <line x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}" class="${conn.type}" />\n`;
    }

    // Draw nodes
    for (const node of geometry.nodes) {
      svg += `  <circle cx="${node.x}" cy="${node.y}" r="${node.type === 'center' ? 4 : 3}" class="node" />\n`;
      svg += `  <text x="${node.x + 8}" y="${node.y - 8}" class="label">${node.label}</text>\n`;
    }

    // Mark vesica piscis intersection points
    svg += `  <circle cx="${geometry.vesicaPoints.top.x}" cy="${geometry.vesicaPoints.top.y}" r="4" fill="#e91e63" />\n`;
    svg += `  <circle cx="${geometry.vesicaPoints.bottom.x}" cy="${geometry.vesicaPoints.bottom.y}" r="4" fill="#e91e63" />\n`;

    svg += `</svg>`;
    return svg;
  }

  /**
   * Generate data for 3D visualization (three.js compatible)
   */
  generate3DData(): {
    vertices: Array<{ x: number; y: number; z: number; label: string }>;
    edges: Array<{ from: number; to: number; type: string }>;
    faces: Array<{ vertices: number[]; color: string }>;
  } {
    const geometry = this.generateGeometry();

    const vertices = geometry.nodes.map((n) => ({
      x: (n.x - this.centerX) / this.radius,
      y: (n.y - this.centerY) / this.radius,
      z: 0,
      label: n.label,
    }));

    const nodeIdToIndex = new Map(geometry.nodes.map((n, i) => [n.id, i]));

    const edges = geometry.connections.map((c) => ({
      from: nodeIdToIndex.get(c.from)!,
      to: nodeIdToIndex.get(c.to)!,
      type: c.type,
    }));

    // Generate triangular faces from triangle connections
    const faces: Array<{ vertices: number[]; color: string }> = [];
    const centerIdx = 0;

    // Add faces between center and triangle edges
    for (let i = 0; i < 6; i++) {
      const nextI = (i + 1) % 6;
      faces.push({
        vertices: [centerIdx, i + 3, nextI + 3], // center + 2 adjacent cardinals
        color: 'rgba(74, 144, 217, 0.1)',
      });
    }

    return { vertices, edges, faces };
  }
}

export const vesicaPiscisVisualizer = new VesicaPiscisVisualizer();
export default vesicaPiscisVisualizer;
