import type { Path } from '@yxl-vscode/cst';
import type { Line, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { anchors } from './anchors';
import { english, files } from './harness';

const SALES = 'sheets:\n  - name: Sales\n';
const row = (at: number, by = 1): Line => ({ sheet: 'Sales' as SheetName, axis: 'row', at, by });

/** What the line would do, each edit as the ops it makes under a node at `node`. */
function moved(source: string, line: Line) {
  const { doc, grid, read } = files(source);
  const { edits, stops } = anchors({ doc, grid }, line, read);
  const node: Path = ['node'];

  return { ops: edits.map((one) => [one.id, one.ops(node)]), stops: stops.map(english) };
}

describe('anchors', () => {
  it('moves a note by its key and a rule by its range, and names each by its node', () => {
    const spec = `${SALES}    comments:\n      A3: "check"\n    conditional:\n      - { at: A3:A4, cell: { greater_than: 0 }, style: { fill: "FF0000" } }\n`;

    expect(moved(spec, row(1))).toEqual({
      ops: [
        [
          '["spec.yxl.yaml","sheets",0,"comments","A3"]',
          [{ op: 'renameKey', path: ['node'], to: 'A4' }],
        ],
        [
          '["spec.yxl.yaml","sheets",0,"conditional",0]',
          [{ op: 'set', path: ['node', 'at'], value: 'A4:A5' }],
        ],
      ],
      stops: [],
    });
  });

  it('says what stands in the way rather than writing round it', () => {
    const spec = `${SALES}    validations:\n      - { at: B1:B1, list: { from: A3:A4 } }\n`;

    expect(moved(spec, row(4, -1)).stops).toEqual([
      '`Sales!B1:B1` refers to `A3:A4`, and `A4` names a row this would take away',
    ]);
  });

  it('does nothing where the line reaches nothing it names', () => {
    expect(moved(`${SALES}    comments:\n      A3: "check"\n`, row(9))).toEqual({
      ops: [],
      stops: [],
    });
  });
});
