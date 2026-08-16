import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { describe, expect, it } from 'vitest';
import { includeReader, yxlExamples } from './corpus';
import { check, oracleVersion, PINNED } from './oracle';

const here = dirname(fileURLToPath(import.meta.url));

/** What this editor made of a spec: whether it could read all of it. */
function read(spec: string): { ok: boolean; said: string } {
  const { diagnostics } = load(parse(readFileSync(spec, 'utf8'), { file: spec }), includeReader);
  return { ok: diagnostics.length === 0, said: diagnostics.map((one) => one.code).join(', ') };
}

function fixtures(kind: string): { name: string; path: string }[] {
  const dir = join(here, 'fixtures', kind);
  return readdirSync(dir).map((name) => ({ name, path: join(dir, name) }));
}

const documents = yxlExamples().filter((sample) => sample.name.endsWith('.yxl.yaml'));
const refused = fixtures('refused');
const deferred = fixtures('deferred');

describe('the oracle', () => {
  it('is the version this editor targets', () => {
    // Not a skip: a disagreement with the wrong build says nothing about this code.
    const how = `install yxl ${PINNED}, or point YXL_BIN at it`;
    expect(oracleVersion(), how).toBe(PINNED);
  });

  it('has specs to be asked about', () => {
    expect(documents.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
    expect(deferred.length).toBeGreaterThan(0);
  });
});

describe.each(documents)('$name', (sample) => {
  it('is a spec the compiler builds', () => {
    expect(check(sample.path).said).toContain('ok');
  });
});

describe.each(refused)('$name', (fixture) => {
  it('is refused here, and by the compiler too', () => {
    // Never stricter than the compiler (ADR-018).
    expect(read(fixture.path).ok).toBe(false);
    expect(check(fixture.path).ok).toBe(false);
  });
});

describe.each(deferred)('$name', (fixture) => {
  it('is refused by the compiler, and carried here', () => {
    // Looser than the compiler on purpose (ADR-011), and measured rather than claimed.
    expect(check(fixture.path).ok).toBe(false);
    expect(read(fixture.path)).toEqual({ ok: true, said: '' });
  });
});
