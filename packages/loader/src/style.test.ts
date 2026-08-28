import { parse } from '@yxl-vscode/cst';
import type { Style } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(declaration: string) {
  const source = `sheets: []\ndefs:\n  styles:\n    look: ${declaration}\n`;
  return load(parse(source, { file: 'spec.yxl.yaml' }));
}

function style(declaration: string): Style {
  const first = loaded(declaration).doc?.defs.styles[0]?.style;
  if (first === undefined) throw new Error('no style loaded');
  return first;
}

function codes(declaration: string): string[] {
  return loaded(declaration).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a style', () => {
  it('reads every attribute the schema gives it', () => {
    const read = style(
      '{ extends: base, font: { bold: true, size: 11, name: Calibri }, fill: "1F3864", align: { horizontal: center, wrap: true }, protection: { locked: false }, format: "#,##0" }',
    );
    expect(read.extends).toBe('base');
    expect(read.font).toEqual({
      bold: true,
      italic: null,
      underline: null,
      strike: null,
      size: 11,
      name: 'Calibri',
      color: null,
    });
    expect(read.fill).toBe('1F3864');
    expect(read.align).toEqual({ horizontal: 'center', vertical: null, wrap: true });
    expect(read.protection).toEqual({ locked: false, hidden: null });
    expect(read.format).toBe('#,##0');
  });

  it('leaves what the spec did not write unset', () => {
    expect(style('{ font: { bold: true } }')).toEqual({
      cleared: new Set(),
      extends: null,
      font: {
        bold: true,
        italic: null,
        underline: null,
        strike: null,
        size: null,
        name: null,
        color: null,
      },
      fill: null,
      border: null,
      align: null,
      protection: null,
      format: null,
    });
  });

  it('reports a key it does not know, naming the ones it does', () => {
    const [diagnostic] = loaded('{ fnot: { bold: true } }').diagnostics;
    expect(diagnostic?.code).toBe(CODE.unknownKey);
    expect(diagnostic?.message).toContain('expected extends, font, fill, border, align');
  });
});

describe('a fill', () => {
  it('reads the hex shorthand and the mapping as the same colour', () => {
    expect(style('{ fill: "FFFF00" }').fill).toBe('FFFF00');
    expect(style('{ fill: { color: "FFFF00" } }').fill).toBe('FFFF00');
  });

  it('keeps the spelling the spec used', () => {
    expect(style('{ fill: "#ffff00" }').fill).toBe('#ffff00');
  });

  it('needs a colour in the mapping form', () => {
    expect(codes('{ fill: {} }')).toEqual([CODE.missingKey]);
  });

  it('refuses text that is not a colour', () => {
    expect(codes('{ fill: yellow }')).toEqual([CODE.badColor]);
  });

  it('keeps a colour a parameter fills in', () => {
    expect(style('{ fill: "${brand}" }').fill).toEqual({ kind: 'template', text: '${brand}' });
  });
});

describe('a border', () => {
  it('reads the shorthand as every side at once', () => {
    expect(style('{ border: thin }').border).toEqual([
      { side: 'all', edge: { style: 'thin', color: null } },
    ]);
  });

  it('reads sides in the order written, because a later one replaces an earlier', () => {
    expect(style('{ border: { left: thick, all: thin } }').border).toEqual([
      { side: 'left', edge: { style: 'thick', color: null } },
      { side: 'all', edge: { style: 'thin', color: null } },
    ]);
  });

  it('reads an edge written with a colour', () => {
    expect(style('{ border: { top: { style: dashed, color: "FF0000" } } }').border).toEqual([
      { side: 'top', edge: { style: 'dashed', color: 'FF0000' } },
    ]);
  });

  it('needs a style in the mapping form of an edge', () => {
    expect(codes('{ border: { top: { color: "FF0000" } } }')).toEqual([CODE.missingKey]);
  });

  it('refuses a line style outside the vocabulary', () => {
    expect(codes('{ border: dotty }')).toEqual([CODE.unknownSpelling]);
  });

  it('keeps a line style a parameter fills in', () => {
    expect(style('{ border: "${weight}" }').border).toEqual([
      { side: 'all', edge: { style: { kind: 'template', text: '${weight}' }, color: null } },
    ]);
    expect(style('{ border: { top: { style: "${weight}" } } }').border).toEqual([
      { side: 'top', edge: { style: { kind: 'template', text: '${weight}' }, color: null } },
    ]);
  });

  it('refuses a side that is not one', () => {
    expect(codes('{ border: { middle: thin } }')).toEqual([CODE.unknownKey]);
  });
});

describe('an alignment', () => {
  it('refuses a horizontal spelling that is a vertical one', () => {
    expect(codes('{ align: { horizontal: top } }')).toEqual([CODE.unknownSpelling]);
  });

  it('reads the spellings both axes share', () => {
    const read = style('{ align: { horizontal: justify, vertical: justify } }');
    expect(read.align).toEqual({ horizontal: 'justify', vertical: 'justify', wrap: null });
  });

  it('keeps a spelling a parameter fills in, on either axis', () => {
    const read = style('{ align: { horizontal: "${across}", vertical: "${down}" } }');
    expect(read.align).toEqual({
      horizontal: { kind: 'template', text: '${across}' },
      vertical: { kind: 'template', text: '${down}' },
      wrap: null,
    });
  });
});

describe('an attribute a style says is not set', () => {
  const clears = (declaration: string) => [...style(declaration).cleared];

  it('is the `null` written at it', () => {
    expect(clears('{ fill: null }')).toEqual(['fill']);
    expect(clears('{ format: null }')).toEqual(['format']);
  });

  it('reads an empty value as the same thing, which is what YAML makes of it', () => {
    expect(clears('{ fill: }')).toEqual(['fill']);
  });

  it('takes a whole group where the group is the `null`', () => {
    expect(clears('{ align: null }')).toEqual(['align.horizontal', 'align.vertical', 'align.wrap']);
    expect(clears('{ protection: null }')).toEqual(['protection.locked', 'protection.hidden']);
  });

  it('takes one leaf of a group where the leaf is', () => {
    expect(clears('{ font: { bold: null, size: null } }')).toEqual(['font.bold', 'font.size']);
  });

  it('takes a border edge whole, since that is the unit a spec draws one at', () => {
    expect(clears('{ border: { left: null } }')).toEqual([
      'border.left.style',
      'border.left.color',
    ]);
  });

  it('takes all four edges for `all`, and for the border itself', () => {
    expect(clears('{ border: { all: null } }')).toEqual(clears('{ border: null }'));
    expect(clears('{ border: null }')).toHaveLength(8);
  });

  it('leaves what it does not name alone', () => {
    const read = style('{ font: { bold: true, italic: null }, fill: null }');

    expect(read.font?.bold).toBe(true);
    expect([...read.cleared]).toEqual(['font.italic', 'fill']);
  });

  it('is not a thing `extends` can be', () => {
    expect(codes('{ extends: null }')).toEqual([CODE.notText]);
  });
});

describe('the `format:` a cell or a band writes beside its style', () => {
  const cell = (body: string) => {
    const source = `sheets:\n  - name: S\n    cells:\n      A1: ${body}\n`;
    return load(parse(source, { file: 'f' })).doc?.sheets[0]?.cells[0];
  };

  it('says there is none where it is `null`', () => {
    expect(cell('{ value: 1, format: null }')?.clearsFormat).toBe(true);
    expect(cell('{ value: 1, format: "0.0%" }')?.clearsFormat).toBe(false);
  });

  it('is enough on its own to make the cell a cell', () => {
    expect(cell('{ format: null }')?.clearsFormat).toBe(true);
  });

  it('reads the same on a band, which a row may take from a column', () => {
    const source = 'sheets:\n  - name: S\n    rows:\n      - { at: 2, format: null }\n';
    const band = load(parse(source, { file: 'f' })).doc?.sheets[0]?.rows[0];
    expect(band?.clearsFormat).toBe(true);
  });

  it('is refused inside a rich run, which inherits nothing to take away', () => {
    const source =
      'sheets:\n  - name: S\n    cells:\n      A1: { rich: [{ text: hi, font: { bold: null } }] }\n';
    const said = load(parse(source, { file: 'f' })).diagnostics;
    expect(said.map((one) => one.code)).toEqual([CODE.notText]);
  });
});

describe('where a style is used', () => {
  it('is a reference when a cell names one', () => {
    const source = 'sheets:\n  - name: S\n    cells:\n      A1: { style: header }\n';
    const cell = load(parse(source, { file: 'f' })).doc?.sheets[0]?.cells[0];
    expect(cell?.style).toEqual({ kind: 'ref', name: 'header' });
  });

  it('is inline when a cell writes one out', () => {
    const source =
      'sheets:\n  - name: S\n    cells:\n      A1: { style: { font: { bold: true } } }\n';
    const cell = load(parse(source, { file: 'f' })).doc?.sheets[0]?.cells[0];
    expect(cell?.style?.kind).toBe('inline');
  });

  it('is a placeholder when a parameter names the style', () => {
    const source = 'sheets:\n  - name: S\n    cells:\n      A1: { style: "${look}" }\n';
    const cell = load(parse(source, { file: 'f' })).doc?.sheets[0]?.cells[0];
    expect(cell?.style).toEqual({ kind: 'ref', name: { kind: 'template', text: '${look}' } });
  });
});
