import { describe, expect, it } from 'vitest';
import { cell } from './harness';
import { shown, standard, tinted, underFormat } from './shown';

describe('what a format would make of the number a cell shows', () => {
  it('is the number the spec holds, under the code asked about', () => {
    expect(underFormat(cell(1, 1, { value: 1234.5678 }), '#,##0.00')).toBe('1,234.57');
  });

  it('is what a formula was computed to, since that is the number on screen (ADR-014)', () => {
    const of = cell(1, 1, { value: null, computed: { kind: 'value', value: 0.085 } });

    expect(underFormat(of, '0.0%')).toBe('8.5%');
  });

  it('is nothing where the cell holds no number to make anything of', () => {
    expect(underFormat(cell(1, 1, { value: 'APAC' }), '#,##0')).toBeNull();
    expect(underFormat(cell(1, 1, { value: null }), '#,##0')).toBeNull();
  });
});

describe('shown', () => {
  it('is what was computed, else what is held, else the formula as written', () => {
    expect(shown(cell(1, 1, { value: 1, computed: { kind: 'value', value: 2 } }))).toBe('2');
    expect(shown(cell(1, 1, { value: 1 }))).toBe('1');
    expect(shown(cell(1, 1, { value: null, formula: 'A1*2' }))).toBe('=A1*2');
    expect(shown(cell(1, 1, { value: null }))).toBe('');
  });
});

describe('standard', () => {
  it('is where General puts a value: a number right, a truth or an error centred, text nowhere', () => {
    expect([1, true, 'x'].map((value) => standard(cell(1, 1, { value })))).toEqual([
      'right',
      'center',
      null,
    ]);
    expect(standard(cell(1, 1, { value: '#N/A', error: true }))).toBe('center');
  });
});

describe('tinted', () => {
  it("is the colour a format section names, in Excel's own colours, or nothing", () => {
    expect(tinted(cell(1, 1, { value: -1, format: '0;[Green]-0' }))).toBe('#00FF00');
    expect(tinted(cell(1, 1, { value: 1, format: '0;[Green]-0' }))).toBeNull();
    expect(tinted(cell(1, 1, { value: true, format: '[Red]0' }))).toBeNull();
  });
});
