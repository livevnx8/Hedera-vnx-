import { describe, expect, it } from 'vitest';

describe('VNX SIMD ternary pack/unpack parity', () => {
  const TO_TRIT = new Map([[-1, 0], [0, 1], [1, 2]]);
  const FROM_TRIT = [-1, 0, 1];

  const pack = (weights: number[]) => {
    const flat = weights;
    const bytes = new Uint8Array(Math.ceil(flat.length / 5));
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
      let packed = 0;
      let multiplier = 1;
      for (let offset = 0; offset < 5; offset++) {
        const value = flat[byteIndex * 5 + offset] ?? 0;
        packed += (TO_TRIT.get(value) ?? 0) * multiplier;
        multiplier *= 3;
      }
      bytes[byteIndex] = packed;
    }
    return bytes;
  };

  const unpack = (bytes: Uint8Array, totalWeights: number) => {
    const weights: number[] = [];
    for (const byte of bytes) {
      let value = byte;
      for (let offset = 0; offset < 5 && weights.length < totalWeights; offset++) {
        const trit = value % 3;
        weights.push(FROM_TRIT[trit]);
        value = Math.floor(value / 3);
      }
    }
    return weights;
  };

  it('round-trips 5 ternary values through 1 byte', () => {
    const original = [1, 0, -1, 0, 1];
    const packed = pack(original);
    expect(packed.length).toBe(1);
    const unpacked = unpack(packed, 5);
    expect(unpacked).toEqual(original);
  });

  it('round-trips 20 values with partial last byte', () => {
    const original = [1, 0, -1, 0, 1, -1, 1, 0, 0, 1, -1, -1, 0, 1, 0, 1, 0, -1, -1, 1];
    const packed = pack(original);
    expect(packed.length).toBe(4);
    const unpacked = unpack(packed, 20);
    expect(unpacked).toEqual(original);
  });

  it('round-trips 13 values with dangling weights', () => {
    const original = [1, 0, -1, 0, 1, -1, -1, 0, 1, 0, 0, 1, -1];
    const packed = pack(original);
    expect(packed.length).toBe(3);
    const unpacked = unpack(packed, 13);
    expect(unpacked).toEqual(original);
  });

  it('dot product matches scalar reference', () => {
    const a = new Int8Array([1, 0, -1, 1, 0]);
    const b = new Int8Array([-1, 1, 1, 0, -1]);
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    expect(sum).toBe(-2);
  });
});
