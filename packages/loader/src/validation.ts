import type { Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import {
  ERROR_STYLES,
  MODELED_KEYS,
  type Saying as Prompt,
  type Validation,
  type ValidationTest,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { readComparison } from './conditional';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import {
  expectBool,
  expectText,
  expectValue,
  findEntry,
  type Opened,
  openEntries,
  readEach,
  rejectUnknownKey,
} from './read';
import { RANGE, readAs, spelling } from './template';
import { entryOf, say, under } from './text';

/** A sheet's `validations:` entries, in the order written (`docs/spec.md` §10). */
export function readValidations(ctx: Ctx, node: Node, path: Path): Validation[] {
  const what = entryOf('validations');

  return readEach(ctx, node, path, '`validations`', (site: Site) => {
    const opened = openEntries(site.ctx, site.node, site.path, what);
    if (opened === null) return null;

    for (const entry of opened.entries) {
      if (!MODELED_KEYS.validation.has(keyOf(entry))) {
        rejectUnknownKey(opened.ctx, entry, what, MODELED_KEYS.validation);
      }
    }

    const anchor = findEntry(opened.entries, 'at');
    if (anchor === undefined) {
      reject(
        opened.ctx,
        CODE.missingKey,
        say('loader.needs', { what, key: 'at' }),
        opened.node.span,
      );
      return null;
    }

    const at = readAs(opened.ctx, anchor.value, under(what, 'at'), RANGE);
    const test = readTest(opened, what);
    if (at === null || test === null) return null;

    return {
      ...identify(opened.ctx, opened.path, opened.node.span),
      at,
      test,
      allowBlank: readBlank(opened, what),
      prompt: readSaid(opened, 'prompt', what),
      error: readError(opened, what),
    };
  });
}

/** The kinds a validation is spelled in; exactly one per entry (`docs/spec.md` §10). */
const COMPARED = ['whole', 'decimal', 'text_length', 'date'] as const;

function readTest(opened: Opened, what: Saying): ValidationTest | null {
  const listed = findEntry(opened.entries, 'list');
  const compared = COMPARED.map((kind) => ({
    kind,
    entry: findEntry(opened.entries, kind),
  })).filter((one) => one.entry !== undefined);

  if (listed !== undefined && compared.length > 0) {
    reject(
      opened.ctx,
      CODE.conflictingKeys,
      say('loader.asks-two-things', { what }),
      opened.node.span,
    );
    return null;
  }

  if (listed !== undefined) return readList(opened.ctx, listed.value, what);

  const only = compared[0];
  if (only === undefined || only.entry === undefined) {
    reject(
      opened.ctx,
      CODE.missingKey,
      say('loader.needs-something-to-ask', { what }),
      opened.node.span,
    );
    return null;
  }
  if (compared.length > 1) {
    reject(
      opened.ctx,
      CODE.conflictingKeys,
      say('loader.asks-two-things', { what }),
      opened.node.span,
    );
    return null;
  }

  const compares = readComparison(opened.ctx, only.entry.value, under(what, only.kind));
  if (compares === null) {
    reject(
      opened.ctx,
      CODE.unknownSpelling,
      say('loader.not-a-comparison', { what, kind: only.kind }),
      only.entry.span,
    );
    return null;
  }

  return { kind: only.kind, compares };
}

/** `list:` is the choices themselves, or `{ from: range }` naming the cells holding them. */
function readList(ctx: Ctx, node: Node, what: Saying): ValidationTest | null {
  if (node.kind === 'map') {
    const opened = openEntries(ctx, node, [], under(what, 'list'));
    const named = opened === null ? undefined : findEntry(opened.entries, 'from');
    if (opened === null || named === undefined) {
      reject(ctx, CODE.missingKey, say('loader.list-needs-choices', { what }), node.span);
      return null;
    }

    const from = expectText(opened.ctx, named.value, under(under(what, 'list'), 'from'));
    return from === null ? null : { kind: 'listFrom', from };
  }

  const choices = readEach(ctx, node, [], under(what, 'list'), (site) =>
    expectValue(site.ctx, site.node, under(what, 'list')),
  );
  return { kind: 'list', choices };
}

function readBlank(opened: Opened, what: Saying): boolean {
  const found = findEntry(opened.entries, 'allow_blank');
  if (found === undefined) return true;

  return expectBool(opened.ctx, found.value, under(what, 'allow_blank')) ?? true;
}

function readError(opened: Opened, what: Saying): Validation['error'] {
  const said = readSaid(opened, 'error', what);
  if (said === null) return null;

  const found = findEntry(opened.entries, 'error');
  const inside = found === undefined ? null : openEntries(opened.ctx, found.value, [], what);
  const named = inside === null ? undefined : findEntry(inside.entries, 'style');
  const style =
    named === undefined
      ? null
      : readAs(
          inside?.ctx ?? opened.ctx,
          named.value,
          under(under(what, 'error'), 'style'),
          spelling(ERROR_STYLES),
        );

  return { ...said, style: style ?? 'stop' };
}

/** A `{ title, body }`, either of which the spec may leave out. */
function readSaid(opened: Opened, key: 'prompt' | 'error', what: Saying): Prompt | null {
  const found = findEntry(opened.entries, key);
  if (found === undefined) return null;

  const inside = openEntries(opened.ctx, found.value, [], under(what, key));
  if (inside === null) return null;

  const known = key === 'prompt' ? MODELED_KEYS.said : MODELED_KEYS.refusal;
  for (const entry of inside.entries) {
    if (!known.has(keyOf(entry))) rejectUnknownKey(inside.ctx, entry, under(what, key), known);
  }

  const said = (name: 'title' | 'body'): string | null => {
    const one = findEntry(inside.entries, name);
    return one === undefined ? null : expectText(inside.ctx, one.value, under(what, key));
  };

  return { title: said('title'), body: said('body') };
}
