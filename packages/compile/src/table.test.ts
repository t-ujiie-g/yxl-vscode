import { reading } from '@yxl-vscode/diag';
import type { DataRow } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { asCsvField, fieldAt, readCsv, readJson, type Table } from './table';
import { WORDS } from './text';

const english = reading('en', WORDS);

function rows(table: Table): readonly DataRow[] {
  if ('problem' in table) throw new Error(english(table.problem));
  return table.rows;
}

function problem(table: Table): string {
  if (!('problem' in table)) throw new Error('it read');
  return english(table.problem);
}

describe('a CSV', () => {
  it('separates fields by comma and records by newline', () => {
    expect(rows(readCsv('APAC,2400000\nEMEA,1750000\n'))).toEqual([
      ['APAC', 2400000],
      ['EMEA', 1750000],
    ]);
  });

  it('needs no trailing newline, and adds no row for one', () => {
    expect(rows(readCsv('a,b'))).toEqual([['a', 'b']]);
    expect(rows(readCsv('a,b\n'))).toHaveLength(1);
  });

  it('takes CRLF, which is half the CSVs in the world', () => {
    expect(rows(readCsv('a,b\r\nc,d\r\n'))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('lets a quoted field hold a comma, a newline, and a doubled quote', () => {
    expect(rows(readCsv('"a,b","c\nd","say ""hi"""'))).toEqual([['a,b', 'c\nd', 'say "hi"']]);
  });

  it('keeps a quoted field text, however much it looks like a number', () => {
    expect(rows(readCsv('"007","true"'))).toEqual([['007', 'true']]);
  });

  it('reads a bare field as what it looks like', () => {
    expect(rows(readCsv('007,true,false,1.5,1e3,APAC'))).toEqual([
      [7, true, false, 1.5, 1000, 'APAC'],
    ]);
  });

  it('reads narrowly, because a CSV is not a YAML document', () => {
    // `0x1F` and `True` are numbers and booleans to YAML's core schema and are
    // text here, which is the reading Excel gives an imported file.
    expect(rows(readCsv('0x1F,True,.inf'))).toEqual([['0x1F', 'True', '.inf']]);
  });

  it('writes no cell for a bare empty field', () => {
    expect(rows(readCsv('a,,b'))).toEqual([['a', null, 'b']]);
  });

  it('leaves a short row short', () => {
    expect(rows(readCsv('a,b\nc\n'))).toEqual([['a', 'b'], ['c']]);
  });

  it('says so when it ends inside a quoted field', () => {
    expect(problem(readCsv('"unterminated'))).toContain('quoted field');
  });
});

describe('a JSON table', () => {
  it('takes an array of arrays as rows', () => {
    expect(rows(readJson('[["APAC", 1], ["EMEA", 2]]', null))).toEqual([
      ['APAC', 1],
      ['EMEA', 2],
    ]);
  });

  it('takes an array of objects in the order `columns` names', () => {
    const source = '[{ "count": 2, "label": "APAC" }]';
    expect(rows(readJson(source, ['label', 'count']))).toEqual([['APAC', 2]]);
  });

  it('reads null as a blank the table leaves open', () => {
    expect(rows(readJson('[[1, null, 3]]', null))).toEqual([[1, null, 3]]);
  });

  it('needs `columns` for objects, whose key order is not dependable', () => {
    expect(problem(readJson('[{ "a": 1 }]', null))).toContain('`columns` must name the fields');
  });

  it('refuses `columns` for arrays, which order themselves', () => {
    expect(problem(readJson('[[1, 2]]', ['a', 'b']))).toContain('row 1 is an array');
  });

  it('says which row is missing a named field', () => {
    expect(problem(readJson('[{ "a": 1 }]', ['a', 'b']))).toContain('row 1 has no field `b`');
  });

  it('refuses a field a cell could not hold', () => {
    expect(problem(readJson('[[{ "a": 1 }]]', null))).toContain('row 1 has a field');
  });

  it('says so when the file is not JSON, or not a table', () => {
    expect(problem(readJson('{oops', null))).toContain('invalid JSON');
    expect(problem(readJson('{ "a": 1 }', null))).toContain('must be an array of rows');
  });
});

describe('a field of a CSV, as a writer needs it', () => {
  const CSV = 'APAC,2400000\n"EMEA, north",1750000\n';

  const sliced = (source: string, row: number, col: number): string | null => {
    const at = fieldAt(source, row, col);
    return at === null ? null : source.slice(at.start, at.end);
  };

  it('spans the field, quotes and all, so what replaces it decides its own', () => {
    expect(sliced(CSV, 1, 0)).toBe('"EMEA, north"');
    expect(sliced(CSV, 0, 1)).toBe('2400000');
  });

  it('spans an empty field where the row leaves one', () => {
    expect(sliced('APAC,,1\n', 0, 1)).toBe('');
  });

  it('stops at the line ending rather than eating it', () => {
    expect(sliced('APAC,1\r\nEMEA,2\r\n', 0, 1)).toBe('1');
  });

  it('says nothing about a row or a field the file has not got', () => {
    expect([fieldAt(CSV, 9, 0), fieldAt(CSV, 0, 9)]).toEqual([null, null]);
  });

  it('writes a value back as the field the reader reads as that value', () => {
    // The quoting is the type: a CSV carries none of its own.
    expect([asCsvField(42), asCsvField('APAC'), asCsvField('007')]).toEqual([
      '42',
      'APAC',
      '"007"',
    ]);
    expect([asCsvField('north, south'), asCsvField(true), asCsvField(null)]).toEqual([
      '"north, south"',
      'true',
      '',
    ]);
  });

  it('leaves a space inside a field alone and quotes one at either end', () => {
    // RFC 4180 asks for neither, but a leading or trailing space is what half
    // the readers in the world trim — so it is written where it cannot be lost.
    expect([asCsvField('Shinjuku West'), asCsvField(' West'), asCsvField('West ')]).toEqual([
      'Shinjuku West',
      '" West"',
      '"West "',
    ]);
  });

  it('round-trips what it writes through the reader that reads it', () => {
    const values = ['007', 'north, south', 'say "hi"', ' padded ', 'Shinjuku West', 42, true];
    const written = values.map(asCsvField).join(',');

    expect(rows(readCsv(`${written}\n`))).toEqual([values]);
  });
});
