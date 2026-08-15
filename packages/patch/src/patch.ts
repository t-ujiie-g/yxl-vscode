import { type Applied, apply, type Node, nodeAt, type Op, type Path, parse } from '@yxl-vscode/cst';
import { type Diagnostic, error, type Span, span } from '@yxl-vscode/diag';
import { CODE } from './codes';

/**
 * One edit to a spec, as the ops that carry it out.
 *
 * A patch is the unit that is applied, undone, and — from the phase that adds
 * the verification loop on — checked before either. Its ops are the syntax
 * layer's, because a `direct` edit *is* one YAML node changing; the spec-level
 * algebra a resolution dialog needs arrives with the phase that needs it.
 */
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
 * Apply a patch, and say how to undo it.
 *
 * **A patch that cannot be undone is not applied.** The inverse is worked out
 * against the file as it stands *before* the edit — the only moment the old
 * value is still there to read — and a patch whose inverse this algebra cannot
 * express leaves the file alone, with a diagnostic saying so. It costs an edit
 * the editor cannot yet undo; it buys a history that is never a lie (ADR-010).
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
 * The patch that puts back what this one is about to change.
 *
 * Read against the document as it is now, and in reverse order: the last thing
 * done is the first thing undone, so ops that touch each other come apart the
 * way they went together.
 *
 * Some edits have no inverse in this algebra yet — removing an entry that holds
 * a mapping rather than a scalar is the one that will matter, and it belongs to
 * the phase that adds structural edits. Those are refused rather than applied
 * and regretted.
 */
export function invert(source: string, patch: Patch, options: Options): Inverted {
  const { root, diagnostics: read } = parse(source, options);
  if (root === null) return { patch: null, diagnostics: read };

  const diagnostics: Diagnostic[] = [];
  const ops: Op[] = [];

  for (const op of [...patch.ops].reverse()) {
    const back = inverseOf(root, op, options, diagnostics);
    if (back === null) return { patch: null, diagnostics };
    ops.push(back);
  }

  return { patch: { ops }, diagnostics };
}

function inverseOf(root: Node, op: Op, options: Options, into: Diagnostic[]): Op | null {
  const found = nodeAt(root, op.path);
  const refuse = (message: string): null => {
    const where: Span = found?.span ?? span(0, 0);
    into.push(error(CODE.noInverse, message, { file: options.file, span: where }));
    return null;
  };

  switch (op.op) {
    case 'set':
    case 'write':
    case 'clear': {
      if (found === null || found.kind !== 'scalar') {
        return refuse('only a scalar can be written over and put back');
      }

      // The text, not the value: a tab written raw inside quotes and a number
      // written `1.50` are the same value and not the same file, and an undo
      // that reformatted either would be an edit of its own.
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
      return { op: 'remove', path: [...op.path, op.index] };

    case 'add':
      return { op: 'remove', path: [...op.path, op.key] };

    case 'remove': {
      if (found === null) return refuse('nothing is there to put back');
      if (found.kind !== 'scalar') {
        return refuse('an entry holding more than a scalar cannot be put back yet');
      }

      const step = op.path[op.path.length - 1];
      const holder = op.path.slice(0, -1);
      if (typeof step === 'number') {
        return { op: 'insert', path: holder, index: step, value: found.value };
      }
      if (step === undefined) return refuse('the document root cannot be put back');

      return {
        op: 'add',
        path: holder,
        key: step,
        value: found.value,
        before: after(root, op.path),
      };
    }
  }
}

/** The key an entry is written as, which is the last step of its own path. */
function keyOf(root: Node, path: Path): string | null {
  const step = path[path.length - 1];
  if (typeof step !== 'string') return null;

  const holder = nodeAt(root, path.slice(0, -1));
  if (holder === null || holder.kind !== 'map') return null;

  return holder.entries.some((one) => one.key.value === step) ? step : null;
}

/** The key of the entry after this one, which is where "back where it was" means. */
function after(root: Node, path: Path): string | null {
  const holder = nodeAt(root, path.slice(0, -1));
  if (holder === null || holder.kind !== 'map') return null;

  const index = holder.entries.findIndex((one) => one.key.value === path[path.length - 1]);
  const next = holder.entries[index + 1];
  return next === undefined ? null : String(next.key.value);
}
