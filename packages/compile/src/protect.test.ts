import { describe, expect, it } from 'vitest';
import { sheet } from './harness';

const SHEET = 'sheets:\n  - name: Figures\n';

describe('a compiled protection', () => {
  it('says whether a password is set, and never what it is (`docs/spec.md` §16)', () => {
    const source = `${SHEET}    protect:\n      password: hunter2\n      allow: { sort: true }\n`;
    const one = sheet(source).protect;
    expect(one?.password).toBe(true);
    expect(JSON.stringify(one)).not.toContain('hunter2');
  });

  it('keeps only what the spec turned on; an allowance turned off is Excel default', () => {
    const source = `${SHEET}    protect:\n      allow: { sort: true, auto_filter: false }\n`;
    expect(sheet(source).protect?.allow).toEqual(['sort']);
    expect(sheet(`${SHEET}    protect: {}\n`).protect).toEqual({
      password: false,
      allow: [],
      node: expect.any(String),
    });
  });
});
