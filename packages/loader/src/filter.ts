import type { Entry, Node } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { type Filter, type FilterColumn, MODELED_KEYS } from '@yxl-vscode/spec';
import { type ColumnSpan, parseColumnSpan } from '@yxl-vscode/units';
import { CODE } from './codes';
import { comparisonOf } from './conditional';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import { follow } from './include';
import { expectValue, type Opened, open, readEach, required } from './read';
import { type Kind, RANGE, readAs } from './template';
import { say, under } from './text';

/** One column letter, never a span: a filter keeps one criterion per column. */
const ONE_COLUMN: Kind<ColumnSpan> = {
  code: CODE.badColumn,
  noun: say('loader.a-column'),
  read: (text) => (text.includes('-') ? null : parseColumnSpan(text)),
};

/** A sheet's `filter:`, the bare range or `{ at, columns }` (`docs/spec.md` §10). */
export function readFilter(ctx: Ctx, node: Node, path: Site['path'], what: Saying): Filter | null {
  const here = follow(ctx, node, path);
  if (here === null) return null;

  if (here.node.kind !== 'map') {
    const at = readAs(here.ctx, here.node, what, RANGE);
    return at === null
      ? null
      : { ...identify(here.ctx, here.path, here.node.span), at, columns: null };
  }

  const opened = open(here, what, MODELED_KEYS.filter);
  if (opened === null) return null;

  const at = required(opened, 'at', what, (entry) =>
    readAs(opened.ctx, entry, under(what, 'at'), RANGE),
  );
  if (at === null) return null;

  return {
    ...identify(opened.ctx, opened.path, opened.node.span),
    at,
    columns: readColumns(opened, under(what, 'columns')),
  };
}

function readColumns(opened: Opened, what: Saying): FilterColumn[] {
  const found = opened.entries.find((entry) => keyOf(entry) === 'columns');
  if (found === undefined) return [];

  return readEach(opened.ctx, found.value, [...opened.path, 'columns'], what, (site) =>
    readColumn(site, what),
  );
}

function readColumn(site: Site, what: Saying): FilterColumn | null {
  const opened = open(site, what, MODELED_KEYS.filterColumn);
  if (opened === null) return null;

  const at = required(opened, 'at', what, (entry) =>
    readAs(opened.ctx, entry, under(what, 'at'), ONE_COLUMN),
  );
  const asked = opened.entries.filter((entry) => keyOf(entry) !== 'at');
  const [only] = asked;
  if (only === undefined) {
    reject(
      opened.ctx,
      CODE.missingKey,
      say('loader.needs-something-to-ask', { what }),
      opened.node.span,
    );
    return null;
  }
  if (asked.length > 1) {
    reject(
      opened.ctx,
      CODE.conflictingKeys,
      say('loader.asks-two-things', { what }),
      opened.node.span,
    );
    return null;
  }
  if (at === null) return null;

  const criterion = readCriterion(opened.ctx, only, under(what, keyOf(only)));
  if (criterion === null) return null;

  return { ...identify(opened.ctx, opened.path, opened.node.span), at, criterion };
}

function readCriterion(ctx: Ctx, entry: Entry, what: Saying): FilterColumn['criterion'] | null {
  if (keyOf(entry) === 'values') return readValues(ctx, entry.value, what);

  const compares = comparisonOf(ctx, entry, what);
  return compares === null ? null : { kind: 'compare', compares };
}

/** The ticked boxes, as the cells display them: text, or a whole number written as its digits. */
function readValues(ctx: Ctx, node: Node, what: Saying): FilterColumn['criterion'] | null {
  const values = readEach(ctx, node, [], what, (site) => {
    const value = expectValue(site.ctx, site.node, what);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isInteger(value)) return String(value);
    if (value !== null)
      reject(site.ctx, CODE.notText, say('loader.must-be-text', { what }), site.node.span);
    return null;
  });
  return values.length === 0 ? null : { kind: 'values', values };
}
