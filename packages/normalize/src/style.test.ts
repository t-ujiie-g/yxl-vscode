import type { StyleSays, StyleValues } from '@yxl-vscode/spec';
import { parseColor, type StyleName, styleName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { type Declared, NEARBY, normalize, written } from './style';

function named(name: string): StyleName {
  const read = styleName(name);
  if (read === null) throw new Error(`not a style name: ${name}`);
  return read;
}

function colour(hex: string) {
  const read = parseColor(hex);
  if (read === null) throw new Error(`not a colour: ${hex}`);
  return read;
}

function declares(of: Record<string, StyleValues>): Declared[] {
  return Object.entries(of).map(([name, gives]) => ({ name: named(name), gives }));
}

const BASE: StyleValues = { 'font.name': 'Calibri', 'font.size': 11 };
const HEADER: StyleValues = {
  'font.name': 'Calibri',
  'font.size': 11,
  'font.bold': true,
  fill: colour('1F3864'),
};

describe('a look already declared', () => {
  it('is written as the name that says it', () => {
    const written = normalize(HEADER, declares({ base: BASE, header: HEADER }));
    expect(written).toEqual({ kind: 'ref', name: 'header' });
  });

  it('is matched whatever order the properties were built in', () => {
    const backwards: StyleValues = { fill: colour('1F3864'), 'font.bold': true, ...BASE };
    expect(normalize(backwards, declares({ header: HEADER }))).toEqual({
      kind: 'ref',
      name: 'header',
    });
  });

  it('wins over a declaration that is merely near', () => {
    const written = normalize(HEADER, declares({ base: BASE, header: HEADER }));
    expect(written).toEqual({ kind: 'ref', name: 'header' });
  });
});

describe('a look near one already declared', () => {
  it('extends it, restating only what differs', () => {
    const wanted: StyleValues = { ...BASE, 'font.bold': true };
    expect(normalize(wanted, declares({ base: BASE }))).toEqual({
      kind: 'extend',
      base: 'base',
      gives: { 'font.bold': true },
    });
  });

  it('restates a property the declaration sets differently', () => {
    const wanted: StyleValues = { 'font.name': 'Calibri', 'font.size': 14 };
    expect(normalize(wanted, declares({ base: BASE }))).toEqual({
      kind: 'extend',
      base: 'base',
      gives: { 'font.size': 14 },
    });
  });

  it('takes the nearest of several, and the one inheriting most where two are as near', () => {
    const wide: StyleValues = { ...BASE, 'font.italic': true };
    const wanted: StyleValues = { ...BASE, 'font.italic': true, 'font.bold': true };

    expect(normalize(wanted, declares({ base: BASE, wide }))).toEqual({
      kind: 'extend',
      base: 'wide',
      gives: { 'font.bold': true },
    });
  });

  it('takes the first by name where two say the same thing', () => {
    const wanted: StyleValues = { ...BASE, 'font.bold': true };

    expect(normalize(wanted, declares({ zeta: BASE, alpha: BASE }))).toMatchObject({
      kind: 'extend',
      base: 'alpha',
    });
  });
});

describe('a look nothing declared can say', () => {
  it('is written where it is used', () => {
    const wanted: StyleValues = { 'font.bold': true };
    expect(normalize(wanted, [])).toEqual({ kind: 'inline', gives: { 'font.bold': true } });
  });

  it('does not extend a declaration that sets what the look does not', () => {
    // `extends` merges; no key in the schema takes a property back, so a base
    // holding a fill the look has not got would put that fill on the cell.
    const wanted: StyleValues = { 'font.name': 'Calibri' };
    expect(normalize(wanted, declares({ base: BASE }))).toEqual({
      kind: 'inline',
      gives: { 'font.name': 'Calibri' },
    });
  });

  it('does not extend one it would restate more of than it inherits', () => {
    const half: StyleValues = { 'font.name': 'Calibri', 'font.size': 11 };
    const wanted: StyleValues = { 'font.name': 'Arial', 'font.size': 11, 'font.bold': true };

    expect(normalize(wanted, declares({ half }))).toMatchObject({ kind: 'inline' });
  });

  it('does not extend a declaration whose every property it restates', () => {
    const other: StyleValues = { 'font.bold': false };
    const wanted: StyleValues = { 'font.bold': true };

    expect(normalize(wanted, declares({ other }))).toEqual({
      kind: 'inline',
      gives: { 'font.bold': true },
    });
  });

  it(`does not extend one it would have to restate more than ${NEARBY} properties of`, () => {
    // Inheriting four and restating three still pays for itself; it is no
    // longer a variant of that look, which is what the threshold is for.
    const wide: StyleValues = {
      'font.name': 'Calibri',
      'font.size': 11,
      'font.italic': true,
      'font.strike': true,
      'font.bold': true,
      'font.underline': true,
      'align.wrap': true,
    };
    const wanted: StyleValues = {
      ...wide,
      'font.bold': false,
      'font.underline': false,
      'align.wrap': false,
    };

    expect(normalize(wanted, declares({ wide }))).toMatchObject({ kind: 'inline' });
  });

  it('writes its properties in the order the model holds them', () => {
    const wanted: StyleValues = { fill: colour('FFFFFF'), 'font.bold': true };
    const written = normalize(wanted, []);

    expect(Object.keys(written?.kind === 'inline' ? written.gives : {})).toEqual([
      'font.bold',
      'fill',
    ]);
  });
});

describe('a look with nothing in it', () => {
  it('is nothing to write', () => {
    expect(normalize({}, declares({ base: BASE }))).toBeNull();
  });
});

describe('a look as a spec writes it', () => {
  it('is the name alone where a declaration says it', () => {
    expect(written({ kind: 'ref', name: named('header') })).toBe('header');
  });

  it('nests the leaves back into the mapping they came from', () => {
    const gives: StyleValues = { 'font.bold': true, 'font.size': 11, 'align.wrap': true };
    expect(written({ kind: 'inline', gives })).toBe(
      '{ font: { bold: true, size: 11 }, align: { wrap: true } }',
    );
  });

  it('quotes a colour and a format code, which are not the numbers they look like', () => {
    const gives: StyleValues = { fill: colour('000000'), format: '0.0%' };
    expect(written({ kind: 'inline', gives })).toBe('{ fill: "000000", format: "0.0%" }');
  });

  it('writes a variant as the declaration it extends and what it says over it', () => {
    const gives: StyleValues = { 'font.bold': true };
    expect(written({ kind: 'extend', base: named('base'), gives })).toBe(
      '{ extends: base, font: { bold: true } }',
    );
  });

  it('spreads a border edge back over the keys it was written under', () => {
    const gives: StyleValues = { 'border.top.style': 'thin', 'border.top.color': colour('CCCCCC') };
    expect(written({ kind: 'inline', gives })).toBe(
      '{ border: { top: { style: thin, color: "CCCCCC" } } }',
    );
  });

  it('writes an attribute taken away as the bare `null` that says so', () => {
    expect(written({ kind: 'inline', gives: { fill: null, format: null } })).toBe(
      '{ fill: null, format: null }',
    );
  });

  it('takes a border away at the edge, which is the unit the schema has for it', () => {
    const gives: StyleSays = { 'border.top.style': null, 'border.top.color': null };
    expect(written({ kind: 'inline', gives })).toBe('{ border: { top: null } }');
  });

  it('keeps an edge whole where only one leaf of it is asked away', () => {
    const gives: StyleSays = { 'border.top.style': 'thin', 'border.top.color': null };
    expect(written({ kind: 'inline', gives })).toBe(
      '{ border: { top: { style: thin, color: null } } }',
    );
  });

  it('names a declaration that takes the same attribute away', () => {
    const plain: Declared = { name: named('plain'), gives: { fill: null } };
    expect(normalize({ fill: null }, [plain])).toEqual({ kind: 'ref', name: 'plain' });
  });
});
