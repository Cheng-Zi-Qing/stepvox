import { describe, it, expect } from "vitest";
import { float32ToPCM16, arrayBufferToBase64 } from "../src/providers/utils";

describe("float32ToPCM16", () => {
  it("converts silence (zeros) to zero bytes", () => {
    const input = new Float32Array([0, 0, 0]);
    const result = float32ToPCM16(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(0);
    expect(view.getInt16(4, true)).toBe(0);
  });

  it("converts max positive to 0x7FFF", () => {
    const input = new Float32Array([1.0]);
    const result = float32ToPCM16(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(0x7fff);
  });

  it("converts max negative to -0x8000", () => {
    const input = new Float32Array([-1.0]);
    const result = float32ToPCM16(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(-0x8000);
  });

  it("clamps values beyond [-1, 1]", () => {
    const input = new Float32Array([2.0, -2.0]);
    const result = float32ToPCM16(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(0x7fff);
    expect(view.getInt16(2, true)).toBe(-0x8000);
  });
});

describe("arrayBufferToBase64", () => {
  it("encodes empty buffer", () => {
    const buf = new ArrayBuffer(0);
    expect(arrayBufferToBase64(buf)).toBe("");
  });

  it("encodes known bytes correctly", () => {
    const buf = new Uint8Array([72, 101, 108, 108, 111]).buffer;
    expect(arrayBufferToBase64(buf)).toBe(btoa("Hello"));
  });
});
