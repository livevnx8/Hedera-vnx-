/**
 * Flower of Life Sacred Geometry Generator
 *
 * Creates the perfect lattice pattern shown in the image:
 * - 1 center circle (the "seed")
 * - 6 surrounding circles (seed of life)
 * - 12 outer circles (flower of life)
 * - Expansion rings for infinite pattern
 *
 * Mathematical foundation:
 * - All circles have same radius
 * - Centers positioned at intersections (vesica piscis points)
 * - Hexagonal close packing arrangement
 */

import { logger } from '../../monitoring/logger.js';

export interface FlowerCircle {
  id: string;
  cx: number;
  cy: number;
  r: number;
  ring: number; // 0=center, 1=seed, 2=flower, 3+=expansion
  index: number;
}

export interface VesicaIntersection {
  x: number;
  y: number;
  circles: string[]; // IDs of intersecting circles
}

export interface FlowerOfLifeGeometry {
  circles: FlowerCircle[];
  intersections: VesicaIntersection[];
  center: { x: number; y: number };
  radius: number;
  ringCount: number;
  totalCircles: number;
}

export interface FlowerOfLifeConfig {
  radius?: number;        // Circle radius (default: 50)
  centerX?: number;       // Center X (default: 200)
  centerY?: number;       // Center Y (default: 200)
  petals?: number;        // Number of rings/layers (1-7, default: 3)
  includeIntersections?: boolean; // Calculate vesica intersections
}

export class FlowerOfLifeGenerator {
  private radius: number;
  private centerX: number;
  private centerY: number;

  /**
   * Generate Flower of Life geometry
   * @param config - Generation configuration
   */
  generate(config: FlowerOfLifeConfig = {}): FlowerOfLifeGeometry {
    const {
      radius = 50,
      centerX = 200,
      centerY = 200,
      petals = 3,
      includeIntersections = true,
    } = config;

    this.radius = radius;
    this.centerX = centerX;
    this.centerY = centerY;

    const circles: FlowerCircle[] = [];
    let circleIndex = 0;

    // Ring 0: Center circle (the seed)
    circles.push({
      id: `circle-center`,
      cx: centerX,
      cy: centerY,
      r: radius,
      ring: 0,
      index: circleIndex++,
    });

    // Generate each ring of circles
    for (let ring = 1; ring <= petals; ring++) {
      const ringCircles = this.generateRing(ring, circleIndex);
      circles.push(...ringCircles);
      circleIndex += ringCircles.length;
    }

    // Calculate vesica piscis intersections
    const intersections: VesicaIntersection[] = includeIntersections
      ? this.calculateIntersections(circles)
      : [];

    logger.debug('FlowerOfLifeGenerator', {
      message: 'Generated sacred geometry',
      petals,
      totalCircles: circles.length,
      intersections: intersections.length,
    });

    return {
      circles,
      intersections,
      center: { x: centerX, y: centerY },
      radius,
      ringCount: petals,
      totalCircles: circles.length,
    };
  }

  /**
   * Generate circles for a specific ring
   * Ring 1: 6 circles around center
   * Ring 2: 12 circles around ring 1
   * Ring 3: 18 circles, etc.
   */
  private generateRing(ring: number, startIndex: number): FlowerCircle[] {
    const circles: FlowerCircle[] = [];
    const count = ring * 6; // 6, 12, 18, 24, ...

    // Distance from center to ring circle centers
    // Ring 1: radius (touching center circle)
    // Ring 2: radius * sqrt(3) (touching ring 1 circles)
    // Ring 3+: continues with hexagonal packing
    const distance = this.radius * Math.sqrt(3 * (ring - 1) + 1);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2; // Start at top (-90°)
      const cx = this.centerX + distance * Math.cos(angle);
      const cy = this.centerY + distance * Math.sin(angle);

      circles.push({
        id: `circle-ring${ring}-${i}`,
        cx,
        cy,
        r: this.radius,
        ring,
        index: startIndex + i,
      });
    }

    return circles;
  }

  /**
   * Calculate vesica piscis intersection points between overlapping circles
   */
  private calculateIntersections(circles: FlowerCircle[]): VesicaIntersection[] {
    const intersections: VesicaIntersection[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const c1 = circles[i];
        const c2 = circles[j];

        // Distance between centers
        const dx = c2.cx - c1.cx;
        const dy = c2.cy - c1.cy;
        const d = Math.sqrt(dx * dx + dy * dy);

        // Check if circles overlap (vesica piscis condition)
        // They must be close enough to intersect but not identical
        if (d > 0 && d < 2 * this.radius && d > 0.001) {
          // Calculate intersection points
          const a = (this.radius * this.radius - this.radius * this.radius + d * d) / (2 * d);
          const h = Math.sqrt(Math.max(0, this.radius * this.radius - a * a));

          const x2 = c1.cx + (a * dx) / d;
          const y2 = c1.cy + (a * dy) / d;

          // Two intersection points
          const ix1 = x2 + (h * dy) / d;
          const iy1 = y2 - (h * dx) / d;

          const ix2 = x2 - (h * dy) / d;
          const iy2 = y2 + (h * dx) / d;

          // Add first intersection
          const key1 = `${ix1.toFixed(2)},${iy1.toFixed(2)}`;
          if (!seen.has(key1)) {
            seen.add(key1);
            intersections.push({
              x: ix1,
              y: iy1,
              circles: [c1.id, c2.id],
            });
          }

          // Add second intersection (if distinct)
          const key2 = `${ix2.toFixed(2)},${iy2.toFixed(2)}`;
          if (!seen.has(key2) && Math.abs(ix1 - ix2) > 0.01 && Math.abs(iy1 - iy2) > 0.01) {
            seen.add(key2);
            intersections.push({
              x: ix2,
              y: iy2,
              circles: [c1.id, c2.id],
            });
          }
        }
      }
    }

    return intersections;
  }

  /**
   * Generate Seed of Life (7 circles: 1 center + 6 surrounding)
   */
  generateSeedOfLife(config?: Omit<FlowerOfLifeConfig, 'petals'>): FlowerOfLifeGeometry {
    return this.generate({ ...config, petals: 1 });
  }

  /**
   * Generate Egg of Life (19 circles: seed + 12 more)
   */
  generateEggOfLife(config?: Omit<FlowerOfLifeConfig, 'petals'>): FlowerOfLifeGeometry {
    return this.generate({ ...config, petals: 2 });
  }
}

export const flowerOfLifeGenerator = new FlowerOfLifeGenerator();
export default flowerOfLifeGenerator;
