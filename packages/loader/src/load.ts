import type { Parsed } from '@yxl-vscode/cst';
import { type Diagnostic, error, span } from '@yxl-vscode/diag';
import type { Defs, Opaque, Param, Sheet, SpecDoc } from '@yxl-vscode/spec';
import { filePath } from '@yxl-vscode/units';
import { CODE } from './codes';
import { NO_DEFS, readDefs, readParams } from './defs';
import { type Ctx, entriesOf, expectMap, keyOf, nodeAt } from './read';
import { readSheets } from './sheet';

/**
 * What reading one file produced.
 *
 * `doc` is null only when there was nothing to read — an empty file, or a root
 * that is not a mapping. Anything less total than that still yields a document:
 * the diagnostics say what could not be read, and the rest is projected.
 */
export interface Loaded {
  readonly doc: SpecDoc | null;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Read a parsed file into the AST.
 *
 * The parser's own diagnostics are not repeated here — a caller that wants both
 * has both, and merging them would report a syntax error twice.
 */
export function load(parsed: Parsed): Loaded {
  const file = filePath(parsed.file);
  if (file === null) {
    const at = { file: parsed.file, span: span(0, 0) };
    const unnamed = error(CODE.unnamedFile, 'a spec is read from a named file', at);
    return { doc: null, diagnostics: [unnamed] };
  }

  const ctx: Ctx = { file, diagnostics: [] };
  const doc = parsed.root === null ? null : readDocument(ctx, parsed);
  return { doc, diagnostics: ctx.diagnostics };
}

function readDocument(ctx: Ctx, parsed: Parsed): SpecDoc | null {
  if (parsed.root === null) return null;

  const map = expectMap(ctx, parsed.root, 'a spec');
  if (map === null) return null;

  let sheets: Sheet[] = [];
  let params: Param[] = [];
  let defs: Defs = NO_DEFS;
  const opaque: Opaque[] = [];

  for (const entry of entriesOf(ctx, map)) {
    const key = keyOf(entry);
    const at = [key];
    switch (key) {
      case 'sheets':
        sheets = readSheets(ctx, entry.value, at);
        break;
      case 'params':
        params = readParams(ctx, entry.value, at);
        break;
      case 'defs':
        defs = readDefs(ctx, entry.value, at);
        break;
      default:
        opaque.push({ ...nodeAt(ctx, at, entry.span), key });
    }
  }

  return { ...nodeAt(ctx, [], parsed.root.span), sheets, params, defs, opaque };
}
