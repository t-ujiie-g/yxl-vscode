import { cellAt, resolve } from '@yxl-vscode/compile';
import { STYLE_PROPERTIES, type StyleSays, type StyleValues } from '@yxl-vscode/spec';
import { type A1Addr, parseColor, type Rect, type SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english, files, wrote } from './harness';
import type { Candidate } from './resolve';
import { setStyle } from './style';

const SALES = 'sheets:\n  - name: Sales\n';

const at = (top: number, left: number, bottom = top, right = left): Rect => ({
  top,
  left,
  bottom,
  right,
});

/** The answers a look asked for has, over the rectangle named — and how the reader took it. */
function offered(
  source: string,
  rect: Rect,
  want: StyleSays,
  whole: 'columns' | 'rows' | null = null,
): readonly Candidate[] {
  const { doc, grid, read } = files(source);
  return setStyle({ doc, grid }, { sheet: 'Sales' as SheetName, rect, whole }, want, read);
}

/** The chosen answer, taken all the way through the checker. */
function taken(source: string, candidate: Candidate): string {
  const { intent } = candidate;
  return wrote(source, intent);
}

const BOLD: StyleValues = { 'font.bold': true };

/** What `A1` wears once a spec is written, resolved as the grid resolves it. */
function worn(source: string): StyleSays {
  const { grid } = files(source);
  const sheet = grid.sheets[0];
  const cell = sheet === undefined ? undefined : cellAt(sheet, 'A1' as A1Addr);

  return resolve(cell?.style ?? []);
}

describe('a look nothing else supplies', () => {
  it('is one answer, which a caller may take without asking', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const answers = offered(spec, at(1, 1), BOLD);

    expect(answers.map((one) => [one.id, one.alone])).toEqual([['onCells', true]]);
  });

  it('turns a cell written as a value into one that carries a look as well', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toBe(
      `${SALES}    cells:\n      A1: { value: 1, style: { font: { bold: true } } }\n`,
    );
  });

  it('writes it beside what a cell already says, leaving that alone', () => {
    const spec = `${SALES}    cells:\n      A1: { value: 1, format: "0.0%" }\n`;
    const [answer] = offered(spec, at(1, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, format: "0.0%", style: { font: { bold: true } } }',
    );
  });

  it('writes a cell of its own at an address nothing has written', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(5, 2), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toBe(
      `${SALES}    cells:\n      A1: 1\n      B5:\n        style: { font: { bold: true } }\n`,
    );
  });

  it('names the declaration that already says exactly this look (ADR-037)', () => {
    const spec = `defs:\n  styles:\n    strong: { font: { bold: true } }\n${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('A1: { value: 1, style: strong }');
  });

  it('extends the declaration a cell already wears rather than restating it', () => {
    const spec = `defs:\n  styles:\n    base: { font: { name: Calibri, size: 11 } }\n${SALES}    cells:\n      A1: { value: 1, style: base }\n`;
    const [answer] = offered(spec, at(1, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { extends: base, font: { bold: true } } }',
    );
  });
});

describe('a look on a cell something else fills', () => {
  const RANGE = `${SALES}    cells:\n      A1: 2\n    formulas:\n      - at: C1:C2\n        formula: "A1*2"\n`;
  const DATA = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;

  it('is a `cells:` entry of its own, since a data block carries no formatting', () => {
    const [answer] = offered(DATA, at(2, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(DATA, answer)).toBe(
      `${DATA}    cells:\n      A2:\n        style: { font: { bold: true } }\n`,
    );
  });

  it('leaves the value where the data block writes it', () => {
    const [answer] = offered(DATA, at(2, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    const { grid } = files(taken(DATA, answer));
    const sheet = grid.sheets[0];
    const cell = sheet === undefined ? undefined : cellAt(sheet, 'A2' as A1Addr);

    expect([cell?.value, resolve(cell?.style ?? [])['font.bold']]).toEqual(['APAC', true]);
  });

  it('goes in beside a cell already written there, not on top of it', () => {
    const both = `${DATA}    cells:\n      Z9: 1\n`;
    const [answer] = offered(both, at(2, 1), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(both, answer)).toContain('      Z9: 1\n      A2:\n        style:');
  });

  it('makes one `cells:` mapping for a rectangle of them, however many go under it', () => {
    const three = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC]\n          - [EMEA]\n          - [LATAM]\n`;
    const [answer] = offered(three, { top: 2, left: 1, bottom: 4, right: 1 }, BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(three, answer)).toBe(
      `${three}    cells:\n      A2:\n        style: { font: { bold: true } }\n      A3:\n        style: { font: { bold: true } }\n      A4:\n        style: { font: { bold: true } }\n`,
    );
  });

  it('goes into the entry the last look made, rather than a second one beside it', () => {
    const [first] = offered(DATA, at(2, 1), BOLD);
    if (first === undefined) throw new Error('nothing was offered');

    const bold = taken(DATA, first);
    const [again] = offered(bold, at(2, 1), { 'font.underline': true });
    if (again === undefined) throw new Error('nothing was offered a second time');

    expect(taken(bold, again)).toContain(
      '      A2:\n        style: { font: { bold: true, underline: true } }\n',
    );
  });

  it('is an exception or the whole run, for a cell a formula range fills', () => {
    const answers = offered(RANGE, at(2, 3), BOLD);

    expect(answers.map((one) => [one.id, english(one.what)])).toEqual([
      ['exception', 'Write it as an override on `C2`'],
      ['ofItsOwn', 'Write it on the column `C`'],
    ]);
  });

  it('writes the exception with the look and no value, since the facets are apart', () => {
    const [answer] = offered(RANGE, at(2, 3), BOLD);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(RANGE, answer)).toContain(
      'overrides:\n  - at: Sales!C2\n    style: { font: { bold: true } }\n',
    );
  });

  it('names every cell the range fills, since the run reaches them too', () => {
    const [, band] = offered(RANGE, at(2, 3), BOLD);

    // C1 and C2 are the range; without them the checker would call them a surprise.
    expect(band?.moves.map((one) => one.at).sort()).toEqual(['C1', 'C2']);
  });

  it('offers only the run where the range keeps its formula, which is its top-left', () => {
    expect(offered(RANGE, at(1, 3), BOLD).map((one) => one.id)).toEqual(['ofItsOwn']);
  });
});

describe('a look the cell itself already carries', () => {
  const BOLDED = `${SALES}    cells:\n      A1: { value: 1, style: { font: { bold: true } } }\n`;

  it("is the cell's own answer and nobody else's, so it is not a question", () => {
    const answers = offered(BOLDED, at(1, 1), { 'font.bold': false });
    expect(answers.map((one) => [one.id, one.alone])).toEqual([['onCells', true]]);
  });

  it('comes off again, leaving the cell as it was written before it went on', () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const [on] = offered(plain, at(1, 1), BOLD);
    if (on === undefined) throw new Error('nothing was offered');

    const bolded = taken(plain, on);
    const [off] = offered(bolded, at(1, 1), { 'font.bold': false });
    if (off === undefined) throw new Error('nothing was offered');

    expect(taken(bolded, off)).toBe(plain);
  });

  it('leaves the rest of the look where only one of it comes off', () => {
    const spec = `${SALES}    cells:\n      A1: { value: 1, style: { font: { bold: true, italic: true } } }\n`;
    const [answer] = offered(spec, at(1, 1), { 'font.bold': false });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('A1: { value: 1, style: { font: { italic: true } } }');
  });

  it('keeps a switch turned off where a band under it turns it on', () => {
    const spec = `${SALES}    columns:\n      - { at: A, style: { font: { bold: true } } }\n    cells:\n      A1: { value: 1, style: { font: { italic: true } } }\n`;
    const [, answer] = offered(spec, at(1, 1), { 'font.bold': false });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { font: { bold: false, italic: true } } }',
    );
  });

  it('does not restate what the band under it already says', () => {
    const spec = `${SALES}    columns:\n      - { at: A, style: { font: { bold: true } } }\n    cells:\n      A1: 1\n`;
    const answers = offered(spec, at(1, 1), { 'font.bold': true });

    expect(answers.map((one) => one.id)).toEqual(['band']);
  });
});

describe('a look something else already supplies', () => {
  const DECLARED = `defs:\n  styles:\n    header: { font: { bold: true }, fill: "1F3864" }\n${SALES}    cells:\n      A1: { value: Region, style: header }\n      B1: { value: Revenue, style: header }\n`;

  it('offers the declaration first, with every cell reading it', () => {
    const answers = offered(DECLARED, at(1, 1), { 'font.bold': false });

    expect(answers.map((one) => [one.id, one.moves.length, one.alone])).toEqual([
      ['definition', 2, false],
      ['onCells', 1, false],
    ]);
  });

  it('changes the definition where that is the answer taken, and nothing else', () => {
    const [answer] = offered(DECLARED, at(1, 1), { 'font.bold': false });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(DECLARED, answer)).toContain('header: { font: { bold: false }, fill: "1F3864" }');
  });

  it('writes a variant on the cell where that is the answer taken', () => {
    const [, answer] = offered(DECLARED, at(1, 1), { 'font.bold': false });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(DECLARED, answer)).toContain(
      'A1: { value: Region, style: { extends: header, font: { bold: false } } }',
    );
  });

  const BANDED = `${SALES}    columns:\n      - { at: A, style: { font: { bold: true } } }\n    cells:\n      A1: 1\n`;

  it('offers the band it comes from, and the cells instead', () => {
    const answers = offered(BANDED, at(1, 1), { 'font.bold': false });
    expect(answers.map((one) => one.id)).toEqual(['band', 'onCells']);
  });

  it('changes the band where that is the answer taken', () => {
    const [answer] = offered(BANDED, at(1, 1), { 'font.bold': false });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(BANDED, answer)).toContain('- { at: A, style: { font: { bold: false } } }');
  });
});

describe('a colour, and a look taken off', () => {
  const FILL = { fill: parseColor('1F3864') } as const;

  it('writes it on a cell that had none', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), FILL);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('A1: { value: 1, style: { fill: "1F3864" } }');
  });

  it('writes it beside the look the cell already carries', () => {
    const spec = `${SALES}    cells:\n      A1: { value: 1, style: { fill: "1F3864" } }\n`;
    const [answer] = offered(spec, at(1, 1), { 'font.color': parseColor('FFFFFF') });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { font: { color: "FFFFFF" }, fill: "1F3864" } }',
    );
  });

  it('takes it off the cell that carries it, leaving the file as it was', () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const [on] = offered(plain, at(1, 1), FILL);
    if (on === undefined) throw new Error('nothing was offered');

    const filled = taken(plain, on);
    const [off] = offered(filled, at(1, 1), { fill: null });
    if (off === undefined) throw new Error('nothing was offered');

    expect(taken(filled, off)).toBe(plain);
  });

  it('offers the declaration it comes from, and the cell that keeps it but not this', () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true }, fill: "1F3864" }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n`;
    const answers = offered(spec, at(1, 1), { fill: null });

    expect(answers.map((one) => one.id)).toEqual(['definition', 'onCells']);
    expect(taken(spec, answers[0] as Candidate)).toContain('header: { font: { bold: true } }');
    expect(taken(spec, answers[1] as Candidate)).toContain(
      'A1: { value: 1, style: { extends: header, fill: null } }',
    );
  });

  const BANDED = `${SALES}    columns:\n      - { at: A, style: { fill: "1F3864" } }\n    cells:\n      A1: 1\n`;

  it('offers the band it comes from, and the one cell that says it has none', () => {
    const answers = offered(BANDED, at(1, 1), { fill: null });

    expect(answers.map((one) => one.id)).toEqual(['band', 'onCells']);
    expect(taken(BANDED, answers[1] as Candidate)).toContain(
      'A1: { value: 1, style: { fill: null } }',
    );
  });

  it('takes the mapping it emptied with it, so the band is as it was written', () => {
    const [answer] = offered(BANDED, at(1, 1), { fill: null });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(BANDED, answer)).toContain('- { at: A }\n');
  });

  it('leaves the leaves beside it alone', () => {
    const spec = `${SALES}    columns:\n      - { at: A, style: { font: { bold: true, color: "FF0000" } } }\n    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), { 'font.color': null });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('- { at: A, style: { font: { bold: true } } }');
  });
});

describe('the whole look taken off at once', () => {
  const OFF = Object.fromEntries(STYLE_PROPERTIES.map((key) => [key, null])) as StyleSays;

  it('leaves the cell holding what it held and nothing else', () => {
    const spec = `${SALES}    cells:\n      A1: { value: 1, style: { font: { bold: true }, fill: FFFF00 } }\n`;
    const [answer] = offered(spec, at(1, 1), OFF);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toBe(`${SALES}    cells:\n      A1: 1\n`);
  });

  it('takes the name off a cell that wore a declaration, and writes nothing in its place', () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true } }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n`;
    const [answer] = offered(spec, at(1, 1), OFF);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('      A1: 1\n');
    expect(worn(taken(spec, answer))).toEqual({});
  });

  it('keeps the declaration where only some of it comes off', () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true }, fill: FFFF00 }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n`;
    const answers = offered(spec, at(1, 1), { 'font.bold': null });
    const cell = answers.find((one) => one.id === 'onCells');
    if (cell === undefined) throw new Error('the cell was not offered');

    expect(taken(spec, cell)).toContain('style: { extends: header, font: { bold: null } }');
  });

  it('takes the name off for one property too, where the name gave only that', () => {
    const spec = `defs:\n  styles:\n    strong: { font: { bold: true } }\n${SALES}    cells:\n      A1: { value: 1, style: strong }\n`;
    const answers = offered(spec, at(1, 1), { 'font.bold': null });
    const cell = answers.find((one) => one.id === 'onCells');
    if (cell === undefined) throw new Error('the cell was not offered');

    expect(taken(spec, cell)).toContain('      A1: 1\n');
  });

  it('says nothing where the cells wear nothing to take off', () => {
    expect(offered(`${SALES}    cells:\n      A1: 1\n`, at(1, 1), OFF)).toEqual([]);
  });
});

describe('where the text sits', () => {
  it('is written under the key the schema keeps it in', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), { 'align.horizontal': 'center' });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { align: { horizontal: center } } }',
    );
  });

  it('comes off again, leaving the cell as it was written', () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const [on] = offered(plain, at(1, 1), { 'align.horizontal': 'center' });
    if (on === undefined) throw new Error('nothing was offered');

    const aligned = taken(plain, on);
    const [off] = offered(aligned, at(1, 1), { 'align.horizontal': null });
    if (off === undefined) throw new Error('nothing was offered');

    expect(taken(aligned, off)).toBe(plain);
  });

  it('says the cell has none where a band puts it somewhere', () => {
    const spec = `${SALES}    columns:\n      - { at: A, style: { align: { horizontal: center } } }\n    cells:\n      A1: 1\n`;
    const answers = offered(spec, at(1, 1), { 'align.horizontal': null });

    expect(answers.map((one) => one.id)).toEqual(['band', 'onCells']);
    expect(taken(spec, answers[1] as Candidate)).toContain(
      'A1: { value: 1, style: { align: { horizontal: null } } }',
    );
  });
});

describe('a number under a format', () => {
  it('is written in the cell key the schema keeps it in, not in its style', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), { format: '0.0%' });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('A1: { value: 1, format: "0.0%" }');
  });

  it('comes off again, leaving the cell as it was written', () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const [on] = offered(plain, at(1, 1), { format: '0.0%' });
    if (on === undefined) throw new Error('nothing was offered');

    const formatted = taken(plain, on);
    const [off] = offered(formatted, at(1, 1), { format: null });
    if (off === undefined) throw new Error('nothing was offered');

    expect(taken(formatted, off)).toBe(plain);
  });

  it('layers over a declaration the cell names rather than replacing it (`docs/spec.md` §6)', () => {
    const spec = `defs:\n  styles:\n    money: { format: "#,##0" }\n${SALES}    cells:\n      A1: { value: 1, style: money }\n`;
    const answers = offered(spec, at(1, 1), { format: '0.0%' });

    expect(answers.map((one) => one.id)).toEqual(['definition', 'onCells']);
    expect(taken(spec, answers[1] as Candidate)).toContain(
      'A1: { value: 1, style: money, format: "0.0%" }',
    );
  });

  it('changes the band own key where the band is what says it', () => {
    const spec = `${SALES}    columns:\n      - { at: A, format: "#,##0" }\n    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), { format: '0.0%' });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('- { at: A, format: "0.0%" }');
  });

  it('says the cell has none where a band gives it one', () => {
    const spec = `${SALES}    columns:\n      - { at: A, format: "#,##0" }\n    cells:\n      A1: 1\n`;
    const answers = offered(spec, at(1, 1), { format: null });

    expect(taken(spec, answers[1] as Candidate)).toContain('A1: { value: 1, format: null }');
  });

  it('writes a cell that is only a format at an address nothing had written', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(3, 2), { format: '0.0%' });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('      B3:\n        format: "0.0%"\n');
  });

  it('goes on beside a look asked for in the same breath', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), { format: '0.0%', 'font.bold': true });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { font: { bold: true } }, format: "0.0%" }',
    );
  });
});

describe('a border a reader draws', () => {
  const ALL: StyleSays = {
    'border.left.style': 'thin',
    'border.right.style': 'thin',
    'border.top.style': 'thin',
    'border.bottom.style': 'thin',
  };

  it('is four edges alike, written as the one word a spec writes them as', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const [answer] = offered(spec, at(1, 1), ALL);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('A1: { value: 1, style: { border: thin } }');
  });

  it('is one edge where one edge is asked for, and keeps the ones beside it', () => {
    const spec = `${SALES}    cells:\n      A1: { value: 1, style: { border: { top: thin } } }\n`;
    const [answer] = offered(spec, at(1, 1), { 'border.bottom.style': 'double' });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { border: { top: thin, bottom: double } } }',
    );
  });

  it('comes off again, leaving the cell as it was written', () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const [on] = offered(plain, at(1, 1), ALL);
    if (on === undefined) throw new Error('nothing was offered');

    const bordered = taken(plain, on);
    const off = Object.fromEntries(
      ['left', 'right', 'top', 'bottom'].flatMap((edge) => [
        [`border.${edge}.style`, null],
        [`border.${edge}.color`, null],
      ]),
    ) as StyleSays;
    const [taking] = offered(bordered, at(1, 1), off);
    if (taking === undefined) throw new Error('nothing was offered');

    expect(taken(bordered, taking)).toBe(plain);
  });

  it('takes the cell with it where the cell was written for the look alone', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      D6:\n        style: { border: thin }\n`;
    const off = Object.fromEntries(
      ['left', 'right', 'top', 'bottom'].flatMap((edge) => [
        [`border.${edge}.style`, null],
        [`border.${edge}.color`, null],
      ]),
    ) as StyleSays;
    const [answer] = offered(spec, at(6, 4), off);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toBe(`${SALES}    cells:\n      A1: 1\n`);
  });

  it('is put on an empty address and taken off again with nothing left behind', () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const [on] = offered(plain, at(6, 4), ALL);
    if (on === undefined) throw new Error('nothing was offered');

    const drawn = taken(plain, on);
    const off = Object.fromEntries(
      ['left', 'right', 'top', 'bottom'].flatMap((edge) => [
        [`border.${edge}.style`, null],
        [`border.${edge}.color`, null],
      ]),
    ) as StyleSays;
    const [taking] = offered(drawn, at(6, 4), off);
    if (taking === undefined) throw new Error('nothing was offered');

    expect(taken(drawn, taking)).toBe(plain);
  });

  it('keeps the colour an edge was drawn in where only the line changes', () => {
    const spec = `${SALES}    cells:\n      A1: { value: 1, style: { border: { top: { style: thin, color: "CCCCCC" } } } }\n`;
    const [answer] = offered(spec, at(1, 1), { 'border.top.style': 'medium' });
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      'A1: { value: 1, style: { border: { top: { style: medium, color: "CCCCCC" } } } }',
    );
  });
});

describe('a rectangle whose cells take it from different places', () => {
  const HEADER = 'defs:\n  styles:\n    header: { font: { bold: true }, fill: "1F3864" }\n';
  const MIXED = `${HEADER}${SALES}    columns:\n      - { at: B, style: { font: { bold: true } } }\n    cells:\n      A1: { value: Region, style: header }\n      B1: { value: Revenue }\n      C1: 3\n`;

  const answers = (want: StyleValues = { 'font.bold': false }) =>
    offered(MIXED, at(1, 1, 1, 3), want);

  it('names the cells an answer would put it on, so one cell does not read as many', () => {
    const [answer] = answers();
    if (answer === undefined) throw new Error('nothing was offered');

    expect(english(answer.what)).toBe(
      'Put it on the 3 cells from `A1`, whatever they take it from now',
    );
  });

  it('offers all of them alike and each origin apart, and picks between them for nobody', () => {
    expect(answers().map((one) => [one.id, one.alone])).toEqual([
      ['all', false],
      ['split', false],
    ]);
  });

  it('writes it on the cells of the rectangle where all of them alike is taken', () => {
    const [answer] = answers();
    if (answer === undefined) throw new Error('nothing was offered');

    const text = taken(MIXED, answer);
    expect(text).toContain(
      'A1: { value: Region, style: { extends: header, font: { bold: false } } }',
    );
    expect(text).toContain('B1: { value: Revenue, style: { font: { bold: false } } }');
    expect(text).toContain('header: { font: { bold: true }, fill: "1F3864" }');
  });

  it('changes the declaration and the band where splitting them is taken', () => {
    const [, answer] = answers();
    if (answer === undefined) throw new Error('nothing was offered');

    const text = taken(MIXED, answer);
    expect(text).toContain('header: { font: { bold: false }, fill: "1F3864" }');
    expect(text).toContain('- { at: B, style: { font: { bold: false } } }');
    expect(text).toContain('B1: { value: Revenue }\n');
  });

  it('is one answer where both would leave the file the same, and asks nothing', () => {
    const [answer, ...rest] = answers({ 'font.bold': true });
    if (answer === undefined) throw new Error('nothing was offered');

    expect([answer.id, answer.alone, rest]).toEqual(['all', true, []]);
    expect(taken(MIXED, answer)).toContain('C1: { value: 3, style: { font: { bold: true } } }');
  });

  it('leaves the declaration and the band alone where that answer is the only one', () => {
    const [answer] = answers({ 'font.bold': true });
    if (answer === undefined) throw new Error('nothing was offered');

    const text = taken(MIXED, answer);
    expect(text).toContain('header: { font: { bold: true }, fill: "1F3864" }');
    expect(text).toContain('- { at: B, style: { font: { bold: true } } }');
  });

  it('does not offer to write on cells an override would hide it under', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\noverrides:\n  - at: Sales!A1\n    style: { font: { bold: true } }\n`;
    const [answer, ...rest] = offered(spec, at(1, 1, 2, 1), { 'font.bold': false });
    if (answer === undefined) throw new Error('nothing was offered');

    expect([answer.id, answer.alone, rest]).toEqual(['split', true, []]);
    expect(taken(spec, answer)).toContain('    style: { font: { bold: false } }');
  });

  it('counts what each answer would move, the cells outside the rectangle included', () => {
    const spec = `${HEADER}${SALES}    cells:\n      A1: { value: Region, style: header }\n      B1: 2\n      D1: { value: Units, style: header }\n`;
    const both = offered(spec, at(1, 1, 1, 2), { 'font.bold': false });

    expect(both.map((one) => [one.id, one.moves.map((move) => move.at)])).toEqual([
      ['all', ['A1', 'B1']],
      ['split', ['A1', 'D1', 'B1']],
    ]);
  });
});

describe('what a look will not do', () => {
  it('says nothing about a look with nothing in it', () => {
    expect(offered(`${SALES}    cells:\n      A1: 1\n`, at(1, 1), {})).toEqual([]);
  });

  it('says nothing about a sheet that is not there', () => {
    const { doc, grid, read } = files(`${SALES}    cells:\n      A1: 1\n`);
    const where = { sheet: 'Nowhere' as SheetName, rect: at(1, 1) };

    expect(setStyle({ doc, grid }, where, BOLD, read)).toEqual([]);
  });
});

describe('a look over the whole of a column', () => {
  const CELLS = `${SALES}    cells:\n      A1: 1\n      B1: 2\n      B2: 3\n`;

  it('is a band, never four hundred cells (ADR-041)', () => {
    const answers = offered(CELLS, at(1, 2, 400, 2), BOLD, 'columns');

    expect(answers.map((one) => [one.id, one.alone])).toEqual([['ofItsOwn', true]]);
    expect(english(answers[0]?.what ?? '')).toBe('Write it on the column `B`');
  });

  it('writes one entry, in the block form a spec writes bands in', () => {
    const [answer] = offered(CELLS, at(1, 2, 400, 2), BOLD, 'columns');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(CELLS, answer)).toBe(
      `${CELLS}    columns:\n      - at: B\n        style: { font: { bold: true } }\n`,
    );
  });

  it('claims the cells the band reaches, and no more', () => {
    const [answer] = offered(CELLS, at(1, 2, 400, 2), BOLD, 'columns');
    expect(answer?.moves.map((one) => one.at)).toEqual(['B1', 'B2']);
  });

  it('names the columns it covers where the reader took several', () => {
    const [answer] = offered(CELLS, at(1, 1, 400, 2), BOLD, 'columns');
    expect(answer?.what).toBe('Write it on the columns `A-B`');
  });

  it('is a row band where the rows are what was taken', () => {
    const [answer] = offered(CELLS, at(1, 1, 1, 20), BOLD, 'rows');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(CELLS, answer)).toContain('    rows:\n      - at: 1\n        style:');
    expect(answer.moves.map((one) => one.at)).toEqual(['A1', 'B1']);
  });

  it('reuses a declaration that already says it, as anything through the normalizer does', () => {
    const spec = `defs:\n  styles:\n    strong:\n      font: { bold: true }\n${CELLS}`;
    const [answer] = offered(spec, at(1, 2, 400, 2), BOLD, 'columns');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('      - at: B\n        style: strong\n');
  });

  it('still offers what supplies the look where something does', () => {
    const spec = `${SALES}    columns:\n      - at: B\n        style: { font: { bold: false } }\n    cells:\n      B1: 2\n`;
    const answers = offered(spec, at(1, 2, 400, 2), BOLD, 'columns');

    expect(answers.map((one) => one.id)).toEqual(['band', 'ofItsOwn']);
  });
});

describe('a look over a column whose cells take it from different places', () => {
  const MIXED = `defs:\n  styles:\n    strong:\n      font: { bold: true }\n${SALES}    cells:\n      B1: { value: 1, style: strong }\n      B2: 2\n`;

  it('is still the band, since the answers a mixed rectangle has would write a cell per row', () => {
    const answers = offered(MIXED, at(1, 2, 400, 2), BOLD, 'columns');
    expect(answers.map((one) => [one.id, one.alone])).toEqual([['ofItsOwn', true]]);
  });

  it('writes the cells where the reader took cells rather than a column', () => {
    const answers = offered(MIXED, at(1, 2, 2, 2), BOLD);
    expect(answers.map((one) => one.id)).toEqual(['all']);
  });
});

describe('a look over a column that a band already covers', () => {
  const BAND = `${SALES}    columns:\n      - at: A-K\n        style: { font: { bold: true } }\n    cells:\n      A1: 1\n`;
  const WHOLE = at(1, 1, 40, 11);

  it('goes into that band rather than writing a second one over the same span', () => {
    const answers = offered(BAND, WHOLE, { 'font.italic': true }, 'columns');
    const [answer] = answers.filter((one) => one.id === 'ofItsOwn');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(BAND, answer)).toBe(
      `${SALES}    columns:\n      - at: A-K\n        style: { font: { bold: true, italic: true } }\n    cells:\n      A1: 1\n`,
    );
  });

  it('takes the band away again when the look it was written for goes', () => {
    // Bold, then not bold: the file is where it started rather than carrying
    // `bold: false` under a band nothing else says anything about.
    const answers = offered(BAND, WHOLE, { 'font.bold': false }, 'columns');
    const [answer] = answers.filter((one) => one.id === 'ofItsOwn');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(BAND, answer)).toBe(`${SALES}    cells:\n      A1: 1\n`);
  });

  it('leaves the band where it says something else as well', () => {
    const sized = `${SALES}    columns:\n      - at: A-K\n        width: 12\n        style: { font: { bold: true } }\n    cells:\n      A1: 1\n`;
    const [answer] = offered(sized, WHOLE, { 'font.bold': false }, 'columns').filter(
      (one) => one.id === 'ofItsOwn',
    );
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(sized, answer)).toBe(
      `${SALES}    columns:\n      - at: A-K\n        width: 12\n    cells:\n      A1: 1\n`,
    );
  });

  it('writes into a band that covers the span and says nothing about the look', () => {
    const sized = `${SALES}    columns:\n      - at: A-K\n        width: 12\n    cells:\n      A1: 1\n`;
    const [answer] = offered(sized, WHOLE, BOLD, 'columns').filter((one) => one.id === 'ofItsOwn');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(sized, answer)).toContain(
      '      - at: A-K\n        width: 12\n        style: { font: { bold: true } }\n',
    );
  });
});
