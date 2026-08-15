import type { Parsed } from '@yxl-vscode/cst';
import { type Diagnostic, error, span } from '@yxl-vscode/diag';
import type { Defs, Opaque, Override, Param, Sheet, SpecDoc } from '@yxl-vscode/spec';
import { filePath } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, type IncludeReader, keyOf, nodeAt } from './ctx';
import { NO_DEFS, readDefs, readParams } from './defs';
import { readOverrides } from './override';
import { expectBool, openEntries } from './read';
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
 * `include` is how the core reaches the files an `$include` names without
 * knowing what a file is (ADR-004). Leaving it out is a legitimate way to read
 * one file alone — every include then reports that it was not expanded, rather
 * than being read as the construct it stands in for.
 *
 * The parser's own diagnostics are not repeated here — a caller that wants both
 * has both, and merging them would report a syntax error twice. Diagnostics
 * from a file this one *included* are here, since nobody else parsed it.
 */
export function load(parsed: Parsed, include?: IncludeReader): Loaded {
  const file = filePath(parsed.file);
  if (file === null) {
    const at = { file: parsed.file, span: span(0, 0) };
    const unnamed = error(CODE.unnamedFile, 'a spec is read from a named file', at);
    return { doc: null, diagnostics: [unnamed] };
  }

  const ctx: Ctx = { file, diagnostics: [], include: include ?? null, chain: [file] };
  const doc = parsed.root === null ? null : readDocument(ctx, parsed);
  return { doc, diagnostics: ctx.diagnostics };
}

function readDocument(ctx: Ctx, parsed: Parsed): SpecDoc | null {
  if (parsed.root === null) return null;

  const opened = openEntries(ctx, parsed.root, [], 'a spec');
  if (opened === null) return null;
  const here = opened.ctx;

  let sheets: Sheet[] = [];
  let params: Param[] = [];
  let defs: Defs = NO_DEFS;
  let overrides: Override[] = [];
  let date1904 = false;
  const opaque: Opaque[] = [];

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const at = [...opened.path, key];
    switch (key) {
      case 'sheets':
        sheets = readSheets(here, entry.value, at);
        break;
      case 'params':
        params = readParams(here, entry.value, at);
        break;
      case 'defs':
        defs = readDefs(here, entry.value, at);
        break;
      case 'overrides':
        overrides = readOverrides(here, entry.value, at);
        break;
      case 'date1904':
        date1904 = expectBool(here, entry.value, '`date1904`') ?? false;
        break;
      default:
        opaque.push({ ...nodeAt(here, at, entry.span), key });
    }
  }

  const site = nodeAt(here, opened.path, opened.node.span);
  return { ...site, sheets, params, defs, overrides, date1904, opaque };
}
