import { describe, expect, it } from 'vitest';
import { dateSerial, durationSerial } from './serial';

describe('a date as Excel keeps it', () => {
  it('numbers a modern date the way Excel does', () => {
    // 1 is 1900-01-01 in Excel's 1900 system, and 45 000 is 2023-03-15 — a
    // number a reader can check against a spreadsheet.
    expect(dateSerial('2023-03-15', false)?.serial).toBe(45000);
  });

  it('carries the leap-year bug Excel carries', () => {
    // Excel counts a 1900-02-29 that never happened, so every date from
    // 1900-03-01 is numbered one higher than the calendar would say. Leaving it
    // out would put every modern date a day early.
    expect(dateSerial('1900-02-28', false)?.serial).toBe(59);
    expect(dateSerial('1900-03-01', false)?.serial).toBe(61);
  });

  it('numbers the same day differently under the 1904 epoch', () => {
    expect(dateSerial('2023-03-15', true)?.serial).toBe(43538);
  });

  it('takes a time of day, as a fraction of a day', () => {
    expect(dateSerial('2023-03-15 06:00:00', false)?.serial).toBe(45000.25);
    expect(dateSerial('2023-03-15T12:00', false)?.serial).toBe(45000.5);
  });

  it('says whether the text carried a time, which decides the default format', () => {
    expect(dateSerial('2023-03-15', false)?.withTime).toBe(false);
    expect(dateSerial('2023-03-15 06:00:00', false)?.withTime).toBe(true);
  });

  it('refuses a day the month does not have', () => {
    expect(dateSerial('2023-02-29', false)).toBeNull();
    expect(dateSerial('2023-04-31', false)).toBeNull();
    expect(dateSerial('1900-02-29', false)).toBeNull();
  });

  it('takes the leap day of a leap year, including a four-hundredth one', () => {
    expect(dateSerial('2024-02-29', false)).not.toBeNull();
    expect(dateSerial('2000-02-29', false)).not.toBeNull();
  });

  it('refuses anything that is not a date', () => {
    for (const text of ['', '2023', '2023-13-01', '15/03/2023', '2023-03-15 25:00']) {
      expect(dateSerial(text, false)).toBeNull();
    }
  });
});

describe('an elapsed time as Excel keeps it', () => {
  it('is a fraction of a day', () => {
    expect(durationSerial('12:00:00')).toBe(0.5);
    expect(durationSerial('6:00')).toBe(0.25);
  });

  it('lets the hours run past a day, which is what makes it elapsed', () => {
    expect(durationSerial('36:00:00')).toBe(1.5);
    expect(durationSerial('26:30:00')).toBeCloseTo(1.104_166_67, 8);
  });

  it('refuses minutes and seconds that are not', () => {
    expect(durationSerial('1:60')).toBeNull();
    expect(durationSerial('1:00:60')).toBeNull();
  });

  it('refuses anything that is not an elapsed time', () => {
    for (const text of ['', '12', 'noon', '-1:00']) {
      expect(durationSerial(text)).toBeNull();
    }
  });
});
