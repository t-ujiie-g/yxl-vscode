import {
  type Applied,
  apply,
  type Node,
  nodeAt,
  type Op,
  type Path,
  parse,
  removalOf,
} from '@yxl-vscode/cst';
import { type Diagnostic, error, type Span, span } from '@yxl-vscode/diag';
import { CODE } from './codes';

/** One edit to a spec, as the ops that carry it out: the unit that is applied, undone, and checked. */
export interface Patch {
  readonly ops: readonly Op[];
}

export interface Options {
  readonly file: string;
}

/** A patch applied: what the file became, and the patch that takes it back. */
export interface Change extends Applied {
  readonly back: Patch | null;
}

/**
 * Apply a patch and say how to undo it. A patch that cannot be undone is not
 * applied (ADR-026): the inverse is worked out first, against the file as it
 * stands before the edit.
 */
export function applyPatch(source: string, patch: Patch, options: Options): Change {
  const inverse = invert(source, patch, options);
  if (inverse.patch === null) {
    return { text: source, edits: [], diagnostics: inverse.diagnostics, back: null };
  }

  const applied = apply(source, patch.ops, options);
  if (applied.diagnostics.length > 0) return { ...applied, text: source, edits: [], back: null };

  return { ...applied, back: inverse.patch };
}

/** A patch, or the reasons there is none. */
export interface Inverted {
  readonly patch: Patch | null;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The patch that puts back what this one is about to change, read against the
 * document as it is now and in reverse order.
 */
export function invert(source: string, patch: Patch, options: Options): Inverted {
  const { root, diagnostics: read } = parse(source, options);
  if (root === null) return { patch: null, diagnostics: read };

  const diagnostics: Diagnostic[] = [];
  const ops: Op[] = [];
  const going = new Set(
    patch.ops.filter((one) => one.op === 'remove').map((one) => mark(one.path)),
  );

  for (const op of [...patch.ops].reverse()) {
    const back = inverseOf(source, root, op, options, diagnostics, going);
    if (back === null) return { patch: null, diagnostics };
    ops.push(back);
  }

  return { patch: { ops }, diagnostics };
}

/** A path as one comparable string, so a patch can be asked what else it removes. */
function mark(path: Path): string {
  return JSON.stringify(path);
}

/** The entry a restore goes above: the next sibling this patch is not also removing (ADR-026). */
function anchor(
  root: Node,
  path: Path,
  before: string | null,
  going: ReadonlySet<string>,
): string | null {
  const holder = nodeAt(root, path.slice(0, -1));
  if (before === null || holder === null || holder.kind !== 'map') return before;

  const keys = holder.entries.map((entry) => String(entry.key.value));
  for (let index = keys.indexOf(before); index >= 0 && index < keys.length; index += 1) {
    const key = keys[index] as string;
    if (!going.has(mark([...path.slice(0, -1), key]))) return key;
  }

  return null;
}

function inverseOf(
  source: string,
  root: Node,
  op: Op,
  options: Options,
  into: Diagnostic[],
  going: ReadonlySet<string>,
): Op | null {
  const found = nodeAt(root, op.path);
  const refuse = (message: string): null => {
    const where: Span = found?.span ?? span(0, 0);
    into.push(error(CODE.noInverse, message, { file: options.file, span: where }));
    return null;
  };

  switch (op.op) {
    case 'write': {
      if (found === null) return refuse('nothing is there to write over');

      return { op: 'write', path: op.path, source: slice(source, found) };
    }

    case 'set':
    case 'clear': {
      if (found === null || found.kind !== 'scalar') {
        return refuse('only a scalar can be written over and put back');
      }

      // The bytes, not the value: `1.50` and `1.5` are one value and two files.
      return found.source === ''
        ? { op: 'clear', path: op.path }
        : { op: 'write', path: op.path, source: found.source };
    }

    case 'renameKey': {
      const key = keyOf(root, op.path);
      if (key === null) return refuse('a rename puts back a key, and there is none here');

      return { op: 'renameKey', path: [...op.path.slice(0, -1), op.to], to: key };
    }

    case 'insert':
    case 'insertSource':
      return { op: 'remove', path: [...op.path, op.index] };

    case 'add':
      return { op: 'remove', path: [...op.path, op.key] };

    case 'addSource':
      return { op: 'remove', path: [...op.path, op.key] };

    case 'remove': {
      if (found === null) return refuse('nothing is there to put back');
      if (op.path.length === 0) return refuse('the document root cannot be put back');

      const taken = removalOf(source, root, op.path);
      if (taken === null) return refuse('nothing is there to put back');

      if (taken.of === 'flow') {
        return { op: 'write', path: taken.path, source: taken.source };
      }
      if (taken.inexact !== null) return refuse(taken.inexact);

      return {
        op: 'restore',
        path: op.path.slice(0, -1),
        key: taken.key,
        before: anchor(root, op.path, taken.before, going),
        source: source.slice(taken.span.start, taken.span.end),
      };
    }

    case 'restore':
      return { op: 'remove', path: [...op.path, op.key] };
  }
}

/** The bytes a node is written as, which is what puts it back unchanged. */
function slice(source: string, node: Node): string {
  return source.slice(node.span.start, node.span.end);
}

/** The key an entry is written as, which is the last step of its own path. */
function keyOf(root: Node, path: Path): string | null {
  const step = path[path.length - 1];
  if (typeof step !== 'string') return null;

  const holder = nodeAt(root, path.slice(0, -1));
  if (holder === null || holder.kind !== 'map') return null;

  return holder.entries.some((one) => one.key.value === step) ? step : null;
}
