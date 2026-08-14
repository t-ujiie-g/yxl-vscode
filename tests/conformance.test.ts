import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { yxlExamples } from './corpus';
import { check, oracleVersion, PINNED } from './oracle';

const here = dirname(fileURLToPath(import.meta.url));

const include: IncludeReader = (from, path) => {
  const resolved = resolve(dirname(from), path);
  const file = filePath(resolved);
  if (file === null) return null;

  try {
    return { file, source: readFileSync(resolved, 'utf8') };
  } catch {
    return null;
  }
};

/** What this editor made of a spec: whether it could read all of it. */
function read(spec: string): { ok: boolean; said: string } {
  const { diagnostics } = load(parse(readFileSync(spec, 'utf8'), { file: spec }), include);
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
    // Not a skip: the schema moves until yxl's v1.0, so a disagreement with the
    // wrong build says nothing about this code, and a missing one says nothing
    // at all. `YXL_BIN` names a build that is not on the path.
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
    // The invariant that matters (ADR-018): this editor is never *stricter*
    // than the compiler. Refusing to read a spec that builds would make the
    // editor an obstacle rather than a help, and it is the failure mode a
    // second implementation of the schema produces.
    expect(read(fixture.path).ok).toBe(false);
    expect(check(fixture.path).ok).toBe(false);
  });
});

describe.each(deferred)('$name', (fixture) => {
  it('is refused by the compiler, and carried here', () => {
    // The other direction is deliberate, not a defect: `yxl build --check` is
    // the validator of record and this editor validates only what projection
    // requires (ADR-011). These are the cases where that gap is real, listed so
    // that it is measured rather than claimed.
    expect(check(fixture.path).ok).toBe(false);
    expect(read(fixture.path)).toEqual({ ok: true, said: '' });
  });
});
