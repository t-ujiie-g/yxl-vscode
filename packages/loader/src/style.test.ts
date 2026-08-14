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
