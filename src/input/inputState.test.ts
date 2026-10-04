import { describe, expect, it } from 'vitest';
import { edgeDirection } from './inputState';

describe('edgeDirection', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  it('pans toward the edge the pointer is at', () => {
    expect(edgeDirection(5, 300, rect)).toEqual({ r: -1, u: 0 });
    expect(edgeDirection(400, 595, rect)).toEqual({ r: 0, u: -1 });
  });
  it('does not pan when the pointer position is unknown or central', () => {
    expect(edgeDirection(-1, -1, rect)).toEqual({ r: 0, u: 0 });
    expect(edgeDirection(400, 300, rect)).toEqual({ r: 0, u: 0 });
  });
});
