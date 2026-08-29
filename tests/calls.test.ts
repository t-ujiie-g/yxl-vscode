import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './corpus';

/**
 * A function whose whole body is a call to itself, which no suite here can see:
 * the panel's own wiring has no tests, and a rewrite that folded sixteen calls
 * into one folded the one as well (#172).
 */
function sources(from: string): string[] {
  return readdirSync(from).flatMap((name) => {
    const path = join(from, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

/**
 * Where the first statement of a body is a call to the name the body belongs
 * to, which is a loop with no way out. Real recursion has a base case above the
 * call, so it does not read this way.
 */
function callsItself(source: string): string[] {
  const methods =
    /^ +(?:(?:private|public|protected|static|async|readonly) )*(\w+)\([^)]*\)(?::[^{\n]+)?\s*\{\n\s*(?:return |void )?this\.(\w+)\(/gm;
  const functions =
    /^(?:export )?function (\w+)\([^)]*\)(?::[^{\n]+)?\s*\{\n\s*(?:return )?(\w+)\(/gm;

  return [...source.matchAll(methods), ...source.matchAll(functions)]
    .filter((one) => one[1] === one[2])
    .map((one) => one[1] ?? '');
}

describe('what a function does with its own name', () => {
  it('never has a body that is only a call to itself', () => {
    const found = sources(join(REPO_ROOT, 'packages')).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return callsItself(source).map((name) => `${path.slice(REPO_ROOT.length + 1)}: ${name}`);
    });

    expect(found).toEqual([]);
  });
});
