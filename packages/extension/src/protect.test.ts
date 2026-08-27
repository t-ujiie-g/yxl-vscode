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

describe("a sheet's protection handed to the view", () => {
  it('says what Excel will do, what it will still allow, and never the password', () => {
    const source = `${FIGURES}    protect:\n      password: hunter2\n      allow: { sort: true, auto_filter: true }\n`;
    const protect = drawn(source).protect;
    expect(protect?.says).toContain(
      'When Excel opens this sheet it will protect it behind a password',
    );
    expect(protect?.says).toContain('still be allowed: sort, auto filter.');
    expect(JSON.stringify(protect)).not.toContain('hunter2');
  });

  it("says Excel's own default where the spec allows nothing by name", () => {
    const source = `${FIGURES}    protect: {}\n`;
    const says = drawn(source).protect?.says ?? '';
    expect(says).toContain('it will protect it.');
    expect(says).toContain("only selecting — Excel's own default");
  });

  it('says the lock is about the workbook rather than about editing the spec here', () => {
    const says = drawn(`${FIGURES}    protect: {}\n`).protect?.says ?? '';
    expect(says).toContain('your readers will be able to type into');
    expect(says).toContain('Editing the spec here is unaffected.');
  });
});
