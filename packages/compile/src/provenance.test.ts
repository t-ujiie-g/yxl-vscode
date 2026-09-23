import { nodeId } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { type FacetOrigin, through } from './provenance';

describe('the origin an edit answers to', () => {
  const field: FacetOrigin = { kind: 'inline', node: nodeId('block'), row: 0, col: 1 };

  it('is the field a layout cell read', () => {
    const drawn: FacetOrigin = {
      kind: 'layout',
      node: nodeId('c'),
      layout: nodeId('l'),
      from: field,
    };
    expect(through(drawn)).toBe(field);
  });

  it('is the origin itself for anything else', () => {
    const drawn: FacetOrigin = {
      kind: 'layout',
      node: nodeId('c'),
      layout: nodeId('l'),
      from: null,
    };
    expect(through(drawn)).toBe(drawn);
    expect(through(field)).toBe(field);
  });
});
