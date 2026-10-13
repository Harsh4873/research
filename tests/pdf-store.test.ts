import { describe, expect, it } from 'vitest';
import { copyStoredPdf } from '../src/lib/pdf-store';

describe('stored PDF bytes', () => {
  it('copies an ArrayBuffer so a later edit cannot change the stored bytes', () => {
    const original = new Uint8Array([9, 8, 7]).buffer;
    const copy = copyStoredPdf(original);
    expect(copy).not.toBe(original);
    new Uint8Array(original)[0] = 1;
    expect(new Uint8Array(copy as ArrayBuffer)).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('copies a view from the middle of a larger buffer', () => {
    const raw = new Uint8Array([1, 2, 3, 4, 5]);
    const view = raw.subarray(1, 4);
    const copy = copyStoredPdf(view);
    expect(new Uint8Array(copy as ArrayBuffer)).toEqual(new Uint8Array([2, 3, 4]));
    expect((copy as ArrayBuffer).byteLength).toBe(3);
  });

  it('copies a DataView', () => {
    const raw = new Uint8Array([4, 5, 6, 7]);
    const view = new DataView(raw.buffer, 1, 2);
    const copy = copyStoredPdf(view);
    expect(new Uint8Array(copy as ArrayBuffer)).toEqual(new Uint8Array([5, 6]));
  });

  it('returns null for anything that is not bytes', () => {
    expect(copyStoredPdf(null)).toBeNull();
    expect(copyStoredPdf(undefined)).toBeNull();
    expect(copyStoredPdf('pdf')).toBeNull();
    expect(copyStoredPdf(new Blob(['x']))).toBeNull();
  });

  it('returns null when the stored buffer is detached', () => {
    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4]);
    structuredClone(buffer, { transfer: [buffer] });
    expect(copyStoredPdf(view)).toBeNull();
    expect(copyStoredPdf(buffer)).toBeNull();
  });
});
