import { describe, expect, it } from 'vitest';
import { nodeIdAt } from './id';

describe('nodeIdAt', () => {
  it('names the root', () => {
    expect(nodeIdAt([])).toBe('[]');
  });

  it('spells out the steps that reach the node', () => {
    expect(nodeIdAt(['sheets', 0, 'cells', 'A1'])).toBe('["sheets",0,"cells","A1"]');
  });

  it('keeps two nodes apart when a step holds the separator', () => {
    // A style may be named anything, `a","b` included; a joined path would make
    // these two the same node.
    expect(nodeIdAt(['defs', 'styles', 'a","b'])).not.toBe(nodeIdAt(['defs', 'styles', 'a', 'b']));
  });

  it('tells an index from the text of one', () => {
    expect(nodeIdAt(['sheets', 0])).not.toBe(nodeIdAt(['sheets', '0']));
  });
});
