import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import type { DrawnSheet } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { project } from './project';

const FILE = '/specs/report.yxl.yaml';
const read: IncludeReader & DataReader = () => null;

function drawn(source: string): DrawnSheet {
  const sheet = project(source, FILE, read).drawing.sheets[0];
  if (sheet === undefined) throw new Error('drew no sheet');
  return sheet;
}

const FIGURES = 'sheets:\n  - name: Figures\n    cells:\n      A1: Region\n';

describe("a sheet's print setup handed to the view", () => {
  it('carries the area and the breaks, and says the rest in a sentence', () => {
    const source = `${FIGURES}    print:\n      area: A1:D50\n      orientation: landscape\n      scale: 80\n      breaks: [A21]\n      header: "&CQuarterly"\n`;
    const print = drawn(source).print;
    expect(print?.area).toEqual({ top: 1, left: 1, bottom: 50, right: 4 });
    expect(print?.breaks).toEqual([{ row: 21, col: 1 }]);
    expect(print?.says).toContain('A1:D50 prints, landscape, scaled to 80%');
    expect(print?.says).toContain('header `&CQuarterly`');
    expect(print?.says).toContain('does not paginate');
  });

  it('says the whole sheet prints where no area is named, and how it is fitted', () => {
    const source = `${FIGURES}    print:\n      fit: { width: 1, height: 0 }\n`;
    expect(drawn(source).print?.says).toContain('The whole sheet prints, fitted to 1 page across');
  });
});
