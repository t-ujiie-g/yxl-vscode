import { type FilePath, filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { nodeIdAt } from './id';

function file(name: string): FilePath {
  const branded = filePath(name);
  if (branded === null) throw new Error(`not a path: ${name}`);
  return branded;
}

const FILE = file('spec.yxl.yaml');
const OTHER = file('cells.yaml');

describe('nodeIdAt', () => {
  it('names the root of a file', () => {
    expect(nodeIdAt(FILE, [])).toBe('["spec.yxl.yaml"]');
  });

  it('spells out the steps that reach the node', () => {
    expect(nodeIdAt(FILE, ['sheets', 0, 'cells', 'A1'])).toBe(
      '["spec.yxl.yaml","sheets",0,"cells","A1"]',
    );
  });

  it('keeps the same path in two files apart', () => {
    // `$include` makes two files one document, and the first sheet of each is
    // `sheets/0` in its own.
    expect(nodeIdAt(FILE, ['sheets', 0])).not.toBe(nodeIdAt(OTHER, ['sheets', 0]));
  });

  it('keeps two nodes apart when a step holds the separator', () => {
    // A style may be named anything, `a","b` included; a joined path would make
    // these two the same node.
    expect(nodeIdAt(FILE, ['defs', 'styles', 'a","b'])).not.toBe(
      nodeIdAt(FILE, ['defs', 'styles', 'a', 'b']),
    );
  });

  it('tells an index from the text of one', () => {
    expect(nodeIdAt(FILE, ['sheets', 0])).not.toBe(nodeIdAt(FILE, ['sheets', '0']));
  });
});
