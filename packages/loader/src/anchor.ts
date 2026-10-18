import type { Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import {
  type Anchor,
  type ByMeaning,
  type Finder,
  type FreezeAt,
  LAYOUT_PARTS,
  MODELED_KEYS,
  type PartOf,
  type ScalarValue,
  type SpecNode,
  type Templated,
} from '@yxl-vscode/spec';
import type { A1Addr } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import {
  expectBool,
  expectNumber,
  expectText,
  expectValue,
  findEntry,
  type Opened,
  open,
  openEntries,
  readEach,
  required,
  scalarText,
} from './read';
import { ADDRESS, readAs, spelling } from './template';
import { say, under } from './text';

/** Where a layout, a float or a `data:` block sits: a cell, or `{ below: layout, gap }` (`docs/spec.md` §25). */
export function readAnchor(ctx: Ctx, node: Node, what: Saying): Anchor | null {
  if (node.kind !== 'map') return readAs(ctx, node, what, ADDRESS);

  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.below);
  if (opened === null) return null;

  const layout = required(opened, 'below', what, (one) =>
    expectText(opened.ctx, one, under(what, 'below')),
  );
  if (layout === null) return null;

  const gap = findEntry(opened.entries, 'gap');
  if (gap === undefined) return { kind: 'below', layout, gap: 1 };

  const rows = expectNumber(opened.ctx, gap.value, under(what, 'gap'));
  return rows === null ? null : { kind: 'below', layout, gap: rows };
}

const FINDERS = ['where', 'row', 'header', 'footer', 'title'] as const;

/** A cell given by meaning: `{ layout, column, where | row | header | footer }`, or `{ layout, title: true }` (`docs/spec.md` §25). */
export function readByMeaning(ctx: Ctx, node: Node, what: Saying): ByMeaning | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.byMeaning);
  if (opened === null) return null;
  const here = opened.ctx;

  const layout = required(opened, 'layout', what, (one) =>
    expectText(here, one, under(what, 'layout')),
  );
  const named = findEntry(opened.entries, 'column');
  const column = named === undefined ? null : expectText(here, named.value, under(what, 'column'));
  if (layout === null || (named !== undefined && column === null)) return null;

  const finders = opened.entries.filter((entry) =>
    (FINDERS as readonly string[]).includes(keyOf(entry)),
  );
  const [only] = finders;
  if (only === undefined || finders.length > 1) {
    reject(here, CODE.conflictingKeys, say('loader.where-or-row', { what }), opened.node.span);
    return null;
  }

  const key = keyOf(only);
  if (key === 'title') {
    if (column !== null) {
      reject(here, CODE.conflictingKeys, say('loader.title-and-a-column', { what }), node.span);
      return null;
    }
    if (expectBool(here, only.value, under(what, key)) !== true) {
      reject(here, CODE.notABoolean, say('loader.title-must-be-true', { what }), only.value.span);
      return null;
    }
    return { kind: 'layout', layout, column: null, finds: { kind: 'title' } };
  }

  if (column === null) {
    reject(here, CODE.missingKey, say('loader.finder-needs-a-column', { what, key }), node.span);
    return null;
  }
  const finds = readFinder(here, only.value, key, under(what, key));
  return finds === null ? null : { kind: 'layout', layout, column, finds };
}

function readFinder(ctx: Ctx, node: Node, key: string, what: Saying): Finder | null {
  if (key === 'where') {
    const pairs = readWhere(ctx, node, what);
    return pairs === null ? null : { kind: 'where', pairs };
  }
  if (key === 'footer' && scalarText(node) === 'last') return { kind: 'footer', count: 'last' };

  const count = expectNumber(ctx, node, what);
  if (count === null) return null;
  return key === 'footer' ? { kind: 'footer', count } : { kind: key as 'row' | 'header', count };
}

function readWhere(ctx: Ctx, node: Node, what: Saying): [string, ScalarValue][] | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  const pairs: [string, ScalarValue][] = [];
  for (const entry of opened.entries) {
    const value = expectValue(opened.ctx, entry.value, under(what, keyOf(entry)));
    if (value !== null) pairs.push([keyOf(entry), value]);
  }
  return pairs;
}

/** A `rows:` band's `at: { layout, part }` (`docs/spec.md` §4). */
export function readPartOf(ctx: Ctx, node: Node, what: Saying): PartOf | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.partOf);
  if (opened === null) return null;

  const layout = required(opened, 'layout', what, (one) =>
    expectText(opened.ctx, one, under(what, 'layout')),
  );
  const part = required(opened, 'part', what, (one) =>
    readAs(opened.ctx, one, under(what, 'part'), spelling(LAYOUT_PARTS)),
  );
  if (layout === null || part === null || typeof part !== 'string') return null;
  return { kind: 'part', layout, part };
}

/** `freeze: { layout, columns }`, `columns` defaulting to none (`docs/spec.md` §25). */
export function readFreezeAt(ctx: Ctx, node: Node, what: Saying): FreezeAt | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.freezeAt);
  if (opened === null) return null;

  const layout = required(opened, 'layout', what, (one) =>
    expectText(opened.ctx, one, under(what, 'layout')),
  );
  const counted = findEntry(opened.entries, 'columns');
  const columns =
    counted === undefined ? 0 : expectNumber(opened.ctx, counted.value, under(what, 'columns'));
  if (layout === null || columns === null) return null;
  return { kind: 'layout', layout, columns };
}

/** A note's or a link's `at:` in the list form: an A1 cell, or a cell by meaning. */
export type ListedAt = Templated<A1Addr> | ByMeaning;

/** A list of entries each carrying its own `at:`, the rest of each read by `rest` (`docs/spec.md` §10). */
export function readListed<T>(
  ctx: Ctx,
  node: Node,
  path: Path,
  what: Saying,
  known: ReadonlySet<string>,
  rest: (opened: Opened, at: ListedAt) => Omit<T, keyof SpecNode> | null,
): T[] {
  return readEach(ctx, node, path, what, (site) => {
    const opened = open(site, what, known);
    if (opened === null) return null;

    const at = required(opened, 'at', what, (one) =>
      one.kind === 'map'
        ? readByMeaning(opened.ctx, one, under(what, 'at'))
        : readAs(opened.ctx, one, under(what, 'at'), ADDRESS),
    );
    if (at === null) return null;

    const read = rest(opened, at);
    return read === null
      ? null
      : ({ ...identify(opened.ctx, opened.path, opened.node.span), ...read } as T);
  });
}
