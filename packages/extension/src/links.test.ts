import { compile, type DataReader } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { following } from './links';
import type { Spec } from './write';

const ROOT = filePath('/specs/report.yxl.yaml') ?? ('' as FilePath);
const read: IncludeReader & DataReader = () => null;

function opened(source: string): Spec {
  const { doc } = load(parse(source, { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return { root: ROOT, doc, grid: compile(doc, { read }), read, params: new Map() };
}

/** Following the link on `Sales!A1`, as the view asks for it. */
function followed(links: string) {
  const spec = opened(`sheets:\n  - name: Sales\n    links:\n${links}  - name: Notes\n`);
  return following(spec, { sheet: 'Sales', row: 1, col: 1 });
}

describe('following a link', () => {
  it('opens a page outside the workbook', () => {
    expect(followed('      A1: https://example.com/orders/1001\n')).toEqual({
      kind: 'open',
      url: 'https://example.com/orders/1001',
    });
  });

  it('goes to the cell a `to` names, on the sheet it names', () => {
    expect(followed('      A1: { to: "Notes!B3" }\n')).toEqual({
      kind: 'goTo',
      sheet: 'Notes',
      row: 3,
      col: 2,
    });
  });

  it('refuses what it cannot follow, with the reason', () => {
    expect(followed('      B2: https://example.com\n')).toEqual({
      kind: 'refused',
      why: '`A1` holds no link to follow',
    });
    expect(followed('      A1: { to: "Missing!A1" }\n')).toEqual({
      kind: 'refused',
      why: 'there is no sheet named `Missing`',
    });
    expect(followed('      A1: { to: rate }\n')).toEqual({
      kind: 'refused',
      why: '`rate` is a name, and this preview follows cells',
    });
  });

  it('opens the web and the post, and nothing this machine would run', () => {
    // A spec is a file, and a file may come from anywhere: a `file:` or a
    // `vscode:` target would be this preview handing one an open door.
    expect(followed('      A1: "file:///etc/passwd"\n')).toEqual({
      kind: 'refused',
      why: 'this preview opens http, https, mailto, not `file`',
    });
    expect(followed('      A1: "mailto:someone@example.com"\n')).toMatchObject({ kind: 'open' });
    expect(followed('      A1: example.com\n')).toEqual({
      kind: 'refused',
      why: '`example.com` is not a page to open',
    });
  });
});
