import { describe, expect, it } from 'vitest';
import { findViolations, importsOf } from './check-layers.mjs';

const layers = {
  order: ['diag', 'units', 'compile', 'webview', 'extension'],
  hosts: { vscode: 'extension', node: 'extension' },
};

/** @param {Record<string, { files?: Record<string, string>, dependencies?: string[] }>} tree */
function workspace(tree) {
  return new Map(
    Object.entries(tree).map(([name, pkg]) => [
      name,
      {
        files: new Map(Object.entries(pkg.files ?? {})),
        dependencies: pkg.dependencies ?? [],
      },
    ]),
  );
}

describe('findViolations', () => {
  it('accepts an import that points downward', () => {
    const found = findViolations(
      workspace({ compile: { files: { 'a.ts': "import { Span } from '@yxl-vscode/diag';" } } }),
      layers,
    );
    expect(found).toEqual([]);
  });

  it('rejects an import that points upward', () => {
    const found = findViolations(
      workspace({ diag: { files: { 'a.ts': "import { compile } from '@yxl-vscode/compile';" } } }),
      layers,
    );
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe('imports upward: `diag` may not depend on `compile`');
  });

  it('rejects a manifest dependency that points upward', () => {
    const found = findViolations(
      workspace({ units: { dependencies: ['@yxl-vscode/compile'] } }),
      layers,
    );
    expect(found).toHaveLength(1);
    expect(found[0].where).toBe('packages/units/package.json');
    expect(found[0].reason).toBe('imports upward: `units` may not depend on `compile`');
  });

  it('allows a package to import itself', () => {
    const found = findViolations(
      workspace({ units: { files: { 'a.ts': "import x from '@yxl-vscode/units';" } } }),
      layers,
    );
    expect(found).toEqual([]);
  });

  it('reports a package that layers.json does not list', () => {
    const found = findViolations(workspace({ mystery: {} }), layers);
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe('package is not listed in layers.json');
  });

  it('reports an import of a package that layers.json does not list', () => {
    const found = findViolations(
      workspace({ compile: { files: { 'a.ts': "import x from '@yxl-vscode/mystery';" } } }),
      layers,
    );
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe('`mystery` is not listed in layers.json');
  });

  it('keeps the vscode API out of every package but the shell', () => {
    const found = findViolations(
      workspace({ compile: { files: { 'a.ts': "import * as vscode from 'vscode';" } } }),
      layers,
    );
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe('only `extension` may reach the vscode host (ADR-004)');
  });

  it('allows the shell the hosts it owns', () => {
    const found = findViolations(
      workspace({
        extension: {
          files: { 'a.ts': "import * as vscode from 'vscode';\nimport 'node:fs';" },
          dependencies: ['@yxl-vscode/compile'],
        },
      }),
      layers,
    );
    expect(found).toEqual([]);
  });

  it('catches a node builtin imported without its prefix', () => {
    const found = findViolations(
      workspace({ compile: { files: { 'a.ts': "import 'fs';" } } }),
      layers,
    );
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe('only `extension` may reach the node host (ADR-004)');
  });

  it('ignores third-party modules', () => {
    const found = findViolations(
      workspace({ compile: { files: { 'a.ts': "import { parse } from 'yaml';" } } }),
      layers,
    );
    expect(found).toEqual([]);
  });
});

describe('importsOf', () => {
  it('sees a plain import', () => {
    expect(importsOf("import { a } from 'x';")).toEqual(['x']);
  });

  it('sees a re-export', () => {
    expect(importsOf("export * from 'x';")).toEqual(['x']);
    expect(importsOf("export { a } from 'x';")).toEqual(['x']);
  });

  it('sees a type-only import', () => {
    expect(importsOf("import type { A } from 'x';")).toEqual(['x']);
  });

  it('sees a side-effect import', () => {
    expect(importsOf("import 'x';")).toEqual(['x']);
  });

  it('sees a dynamic import', () => {
    expect(importsOf("const m = await import('x');")).toEqual(['x']);
  });

  it('spans an import list the formatter wrapped over several lines', () => {
    expect(importsOf('import {\n  alpha,\n  beta,\n} from `x`;'.replace(/`/g, "'"))).toEqual(['x']);
  });

  it('sees every import in a file, not just the first', () => {
    expect(importsOf("import a from 'x';\nimport b from 'y';")).toEqual(['x', 'y']);
  });

  it('is not fooled by the word "from" inside a string', () => {
    expect(importsOf("const s = 'imported from nowhere';")).toEqual([]);
  });
});
