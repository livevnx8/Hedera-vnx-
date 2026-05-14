/**
 * Sacred Geometry Rendering Engine
 *
 * Renders Flower of Life, Metatron's Cube, and Vesica Piscis
 * in an ethereal, luminescent style matching the sacred geometry aesthetic.
 *
 * Features:
 * - Glowing circles with multiple overlapping layers for depth
 * - Dark background with luminescent white/light colored geometry
 * - SVG filters for blur/glow effects
 * - Optional animation support
 */

import { logger } from '../../monitoring/logger.js';
import {
  FlowerOfLifeGeometry,
  flowerOfLifeGenerator,
  FlowerOfLifeConfig,
} from './flowerOfLife.js';
import {
  MetatronCubeGeometry,
  metatronCubeGenerator,
  MetatronConfig,
} from './metatronCube.js';
import { VesicaPiscisGeometry, vesicaPiscisVisualizer } from './vesicaPiscisVisualizer.js';

export interface RenderConfig {
  width?: number;
  height?: number;
  background?: string;
  circleColor?: string;
  lineColor?: string;
  glowColor?: string;
  intersectionColor?: string;
  opacity?: number;
  glowIntensity?: number;
  strokeWidth?: number;
  showIntersections?: boolean;
  animation?: boolean;
}

const DEFAULT_CONFIG: RenderConfig = {
  width: 400,
  height: 400,
  background: '#0a0a0a',
  circleColor: '#ffffff',
  lineColor: '#ffffff',
  glowColor: '#ffffff',
  intersectionColor: '#ffffff',
  opacity: 0.6,
  glowIntensity: 3,
  strokeWidth: 1.5,
  showIntersections: true,
  animation: false,
};

export class SacredGeometryRenderer {
  /**
   * Render Flower of Life as ethereal SVG
   */
  renderFlowerOfLife(
    geometry: FlowerOfLifeGeometry,
    config: RenderConfig = {}
  ): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const padding = 20;

    // Calculate viewBox
    const allX = geometry.circles.map((c) => c.cx);
    const allY = geometry.circles.map((c) => c.cy);
    const minX = Math.min(...allX) - geometry.radius - padding;
    const maxX = Math.max(...allX) + geometry.radius + padding;
    const minY = Math.min(...allY) - geometry.radius - padding;
    const maxY = Math.max(...allY) + geometry.radius + padding;
    const width = maxX - minX;
    const height = maxY - minY;

    let svg = this.generateSVGHeader(cfg, minX, minY, width, height);

    // Generate multiple layers for depth effect
    // Layer 1: Background glow circles (largest, lowest opacity)
    svg += this.generateCircleLayer(
      geometry.circles,
      cfg.circleColor,
      cfg.strokeWidth * 4,
      cfg.opacity * 0.2,
      cfg.glowIntensity * 2
    );

    // Layer 2: Mid glow circles
    svg += this.generateCircleLayer(
      geometry.circles,
      cfg.circleColor,
      cfg.strokeWidth * 2,
      cfg.opacity * 0.4,
      cfg.glowIntensity
    );

    // Layer 3: Main circles
    svg += this.generateCircleLayer(
      geometry.circles,
      cfg.circleColor,
      cfg.strokeWidth,
      cfg.opacity,
      0
    );

    // Intersection points (vesica piscis highlights)
    if (cfg.showIntersections && geometry.intersections.length > 0) {
      svg += this.generateIntersectionLayer(geometry.intersections, cfg);
    }

    svg += '</svg>';

    return svg;
  }

  /**
   * Render Metatron's Cube as ethereal SVG
   */
  renderMetatronCube(geometry: MetatronCubeGeometry, config: RenderConfig = {}): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const padding = 30;

    const { min, max } = geometry.boundingBox;
    const width = max - min + padding * 2;
    const height = max - min + padding * 2;

    let svg = this.generateSVGHeader(cfg, min - padding, min - padding, width, height);

    // Layer 1: Background circles with heavy glow
    svg += this.generateCircleLayer(
      geometry.circles,
      cfg.circleColor,
      cfg.strokeWidth * 3,
      cfg.opacity * 0.3,
      cfg.glowIntensity * 2
    );

    // Layer 2: Connection lines
    if (geometry.lines.length > 0) {
      svg += this.generateLineLayer(geometry.lines, geometry.nodes, cfg);
    }

    // Layer 3: Main circles
    svg += this.generateCircleLayer(
      geometry.circles,
      cfg.circleColor,
      cfg.strokeWidth,
      cfg.opacity * 1.2,
      0
    );

    // Platonic solids overlay
    if (geometry.platonicSolids.length > 0) {
      svg += this.generatePlatonicLayer(geometry.platonicSolids, geometry.nodes, cfg);
    }

    svg += '</svg>';

    return svg;
  }

  /**
   * Render Vesica Piscis as ethereal SVG
   */
  renderVesicaPiscis(geometry: VesicaPiscisGeometry, config: RenderConfig = {}): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Calculate bounds from circles
    const allCircles = geometry.circles;
    const allX = allCircles.map((c) => c.cx);
    const allY = allCircles.map((c) => c.cy);
    const maxR = Math.max(...allCircles.map((c) => c.r));
    const padding = maxR * 0.5;

    const minX = Math.min(...allX) - maxR - padding;
    const maxX = Math.max(...allX) + maxR + padding;
    const minY = Math.min(...allY) - maxR - padding;
    const maxY = Math.max(...allY) + maxR + padding;

    const width = maxX - minX;
    const height = maxY - minY;

    let svg = this.generateSVGHeader(cfg, minX, minY, width, height);

    // Draw vesica piscis intersection lens
    const vesica = geometry.vesicaPoints;
    const lensHeight = Math.abs(vesica.bottom.y - vesica.top.y);
    const lensCenterY = (vesica.top.y + vesica.bottom.y) / 2;

    // Lens fill (the sacred intersection)
    svg += `  <ellipse cx="${vesica.top.x}" cy="${lensCenterY}" rx="${lensHeight / 3}" ry="${
      lensHeight / 2
    }" fill="rgba(255,255,255,0.1)" />\n`;

    // Circles with layered glow
    svg += this.generateCircleLayer(
      allCircles,
      cfg.circleColor,
      cfg.strokeWidth * 3,
      cfg.opacity * 0.3,
      cfg.glowIntensity
    );

    svg += this.generateCircleLayer(allCircles, cfg.circleColor, cfg.strokeWidth, cfg.opacity, 0);

    // Vesica intersection points
    svg += `  <circle cx="${vesica.top.x}" cy="${vesica.top.y}" r="4" fill="#ffffff" />\n`;
    svg += `  <circle cx="${vesica.bottom.x}" cy="${vesica.bottom.y}" r="4" fill="#ffffff" />\n`;

    // Connection lines
    if (geometry.connections.length > 0) {
      svg += this.generateConnectionLayer(geometry.connections, geometry.nodes, cfg);
    }

    svg += '</svg>';

    return svg;
  }

  /**
   * Generate SVG header with defs and filters
   */
  private generateSVGHeader(
    cfg: RenderConfig,
    minX: number,
    minY: number,
    width: number,
    height: number
  ): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${cfg.width}" height="${cfg.height}" style="background-color: ${cfg.background}">
  <defs>
    <!-- Glow filter -->
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${cfg.glowIntensity}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Heavy glow for background circles -->
    <filter id="heavyGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="${cfg.glowIntensity * 2}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Radial gradient for center -->
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="white" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="white" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>
  
  <!-- Background -->
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${cfg.background}"/>
`;
  }

  /**
   * Generate a layer of circles
   */
  private generateCircleLayer(
    circles: Array<{ cx: number; cy: number; r: number }>,
    color: string,
    strokeWidth: number,
    opacity: number,
    glow: number
  ): string {
    const filter = glow > 0 ? 'filter="url(#heavyGlow)"' : '';
    let layer = '';

    for (const circle of circles) {
      layer += `  <circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}" ${filter}/>\n`;
    }

    return layer;
  }

  /**
   * Generate intersection point layer
   */
  private generateIntersectionLayer(
    intersections: Array<{ x: number; y: number }>,
    cfg: RenderConfig
  ): string {
    let layer = '';

    for (const pt of intersections) {
      // Glow point
      layer += `  <circle cx="${pt.x}" cy="${pt.y}" r="6" fill="${cfg.intersectionColor}" opacity="0.3" filter="url(#heavyGlow)"/>\n`;
      // Core point
      layer += `  <circle cx="${pt.x}" cy="${pt.y}" r="2" fill="${cfg.intersectionColor}" opacity="0.9"/>\n`;
    }

    return layer;
  }

  /**
   * Generate line connection layer for Metatron's Cube
   */
  private generateLineLayer(
    lines: Array<{ from: string; to: string; type: string }>,
    nodes: Array<{ id: string; x: number; y: number; z?: number }>,
    cfg: RenderConfig
  ): string {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let layer = '';

    for (const line of lines) {
      const from = nodeMap.get(line.from);
      const to = nodeMap.get(line.to);
      if (!from || !to) continue;

      const opacity = line.type === 'axis' ? cfg.opacity * 1.2 : cfg.opacity * 0.5;
      const width = line.type === 'axis' ? cfg.strokeWidth : cfg.strokeWidth * 0.5;

      layer += `  <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${cfg.lineColor}" stroke-width="${width}" opacity="${opacity}"/>\n`;
    }

    return layer;
  }

  /**
   * Generate connection layer for Vesica Piscis
   */
  private generateConnectionLayer(
    connections: Array<{ from: string; to: string; type: string }>,
    nodes: Array<{ id: string; x: number; y: number }>,
    cfg: RenderConfig
  ): string {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let layer = '';

    for (const conn of connections) {
      const from = nodeMap.get(conn.from);
      const to = nodeMap.get(conn.to);
      if (!from || !to) continue;

      let color = cfg.lineColor;
      let opacity = cfg.opacity * 0.6;

      switch (conn.type) {
        case 'radius':
          color = '#7cb342';
          break;
        case 'triangle':
          color = '#f57c00';
          opacity = cfg.opacity * 0.5;
          break;
        case 'vesica':
          color = '#e91e63';
          opacity = cfg.opacity * 0.8;
          break;
      }

      layer += `  <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}" stroke-width="1" opacity="${opacity}"/>\n`;
    }

    return layer;
  }

  /**
   * Generate Platonic solids overlay layer
   */
  private generatePlatonicLayer(
    solids: Array<{ name: string; color: string }>,
    nodes: Array<{ id: string; x: number; y: number }>,
    cfg: RenderConfig
  ): string {
    let layer = '';

    // Label the solids at the bottom
    const labelY = Math.max(...nodes.map((n) => n.y)) + 30;
    let labelX = Math.min(...nodes.map((n) => n.x));

    for (const solid of solids) {
      // Legend entry
      layer += `  <rect x="${labelX}" y="${labelY}" width="12" height="12" fill="${solid.color}" opacity="0.7"/>\n`;
      layer += `  <text x="${labelX + 16}" y="${labelY + 10}" font-size="10" fill="${cfg.circleColor}" opacity="0.8">${solid.name}</text>\n`;
      labelX += 80;
    }

    return layer;
  }
}

export const sacredGeometryRenderer = new SacredGeometryRenderer();
export default sacredGeometryRenderer;
