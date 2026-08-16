import type { Node, Path } from '@yxl-vscode/cst';
import { MODELED_KEYS, type Override } from '@yxl-vscode/spec';
import { holdsSomething, readFacets } from './cell';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import { expectText, findEntry, openEntries, readEach, rejectUnknownKey } from './read';
import { QUALIFIED, readAs } from './template';

/**
 * The top-level `overrides:` sequence (`docs/spec.md` §23).
 *
 * What an override may land on needs the whole workbook in view — a declared
 * sheet, a cell something else writes, not the anchor of a filled range, and no
 * second override on the same cell — so those are checked where that view
 * exists, not here.
 */
export function readOverrides(ctx: Ctx, node: Node, path: Path): Override[] {
  return readEach(ctx, node, path, '`overrides`', readOverride);
}

function readOverride(site: Site): Override | null {
  const opened = openEntries(site.ctx, site.node, site.path, 'an override');
  if (opened === null) return null;

  const here = opened.ctx;
  const { entries } = opened;

  const anchor = findEntry(entries, 'at');
  if (anchor === undefined) {
    reject(here, CODE.missingKey, 'an override needs an `at`', opened.node.span);
    return null;
  }
  const at = readAs(here, anchor.value, 'an override `at`', QUALIFIED);
  if (at === null) return null;

  const what = `override \`${label(at)}\``;
  let reason: string | null = null;

  for (const entry of entries) {
    const key = keyOf(entry);
    if (key === 'at' || MODELED_KEYS.cell.has(key)) continue;
    if (key === 'reason') {
      reason = expectText(here, entry.value, `${what} \`reason\``);
      continue;
    }
    rejectUnknownKey(here, entry, what, MODELED_KEYS.override);
  }

  const facets = readFacets(here, entries, what);
  if (!holdsSomething(here, facets, opened.node, what)) return null;

  return { ...identify(here, opened.path, opened.node.span), at, reason, ...facets };
}

/** How the override reads back in a diagnostic, before any parameter fills it in. */
function label(at: Override['at']): string {
  return 'kind' in at ? at.text : `${at.sheet}!${at.at}`;
}
