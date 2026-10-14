import { compile, type DataReader } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { choicesOf, validating, validationSaid } from './validations';

const ROOT = filePath('/specs/report.yxl.yaml') ?? ('' as FilePath);
const read: IncludeReader & DataReader = () => null;

function opened(source: string) {
  const { doc } = load(parse(source, { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');
  return compile(doc, { read });
}

const SHEETS = 'sheets:\n  - name: Sales\n';
const STATUSES =
  '  - name: Statuses\n    cells:\n      A1: Draft\n      A2: Sent\n      A3: Paid\n';

/** The validation over `Sales!B2`, as the drawing looks it up. */
function over(validations: string) {
  const grid = opened(`${SHEETS}    validations:\n${validations}${STATUSES}`);
  const sheet = grid.sheets[0];
  if (sheet === undefined) throw new Error('compiled no sheet');

  const asked = validating(sheet, 'B2' as A1Addr);
  if (asked === null) throw new Error('nothing validates B2');

  return { grid, sheet, asked };
}

describe('the choices a list offers', () => {
  it('are the ones the spec wrote, as text', () => {
    const { grid, asked } = over('      - at: B2:B9\n        list: [Draft, 3, true]\n');
    expect(choicesOf(grid, 'Sales' as SheetName, asked.asks)).toEqual(['Draft', '3', 'true']);
  });

  it('are read off the cells a `from` names, on the sheet it names', () => {
    const { grid, asked } = over('      - at: B2:B9\n        list: { from: "Statuses!A1:A3" }\n');
    expect(choicesOf(grid, 'Sales' as SheetName, asked.asks)).toEqual(['Draft', 'Sent', 'Paid']);
  });

  it('leave out what no cell writes, and are nothing at all for the kinds that only ask', () => {
    const { grid, asked } = over('      - at: B2:B9\n        list: { from: "Statuses!A1:A9" }\n');
    expect(choicesOf(grid, 'Sales' as SheetName, asked.asks)).toEqual(['Draft', 'Sent', 'Paid']);

    const whole = over('      - at: B2:B9\n        whole: { at_least: 1 }\n');
    expect(choicesOf(whole.grid, 'Sales' as SheetName, whole.asked.asks)).toBeNull();
  });

  it('are empty where the sheet it names is not there', () => {
    const { grid, asked } = over('      - at: B2:B9\n        list: { from: "Nowhere!A1:A3" }\n');
    expect(choicesOf(grid, 'Sales' as SheetName, asked.asks)).toEqual([]);
  });
});

describe('what a validation asks, in a reader’s words', () => {
  it('says the prompt, then the rule, then what a refusal says', () => {
    const said = over(
      '      - at: B2:B9\n        whole: { between: [1, 1000] }\n        allow_blank: false\n        prompt: { title: Quantity, body: How many. }\n        error: { title: "Not a quantity" }\n',
    );

    expect(validationSaid(said.asked)).toBe(
      'Quantity: How many.\nA whole number between 1 and 1000.\nNot a quantity\nA blank is refused.',
    );
  });

  it('names each kind in its own words', () => {
    const say = (rule: string) =>
      validationSaid(over(`      - at: B2:B9\n        ${rule}\n`).asked);

    expect(say('list: [Draft]')).toBe('One of the values in the list.');
    expect(say('list: { from: "Statuses!A1:A3" }')).toBe(
      'One of the values in the cells it names.',
    );
    expect(say('decimal: { at_least: 0 }')).toBe('A number at least 0.');
    expect(say('text_length: { at_most: 12 }')).toBe('Text whose length is at most 12.');
    expect(say('date: { not_between: ["2026-01-01", "2026-12-31"] }')).toBe(
      'A date outside 2026-01-01 and 2026-12-31.',
    );
  });
});

describe('the validation a cell is under', () => {
  it('is the last one written to cover it, since Excel keeps one per cell', () => {
    const two = over(
      '      - at: B1:B20\n        list: [Draft]\n      - at: B2:B9\n        list: [Sent]\n',
    );
    expect(choicesOf(two.grid, 'Sales' as SheetName, two.asked.asks)).toEqual(['Sent']);
  });

  it('is nothing where no range covers the cell', () => {
    const grid = opened(`${SHEETS}    validations:\n      - at: D2:D9\n        list: [Draft]\n`);
    const sheet = grid.sheets[0];
    expect(sheet === undefined ? null : validating(sheet, 'B2' as A1Addr)).toBeNull();
  });
});
