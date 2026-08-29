import type { Node, Path } from '@yxl-vscode/cst';
import { MODELED_KEYS, type Table } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import { expectText, findEntry, flag, openEntries, readEach, rejectUnknownKey } from './read';
import { RANGE, readAs } from './template';
import { entryOf, say, under } from './text';

/** A sheet's `tables:` entries, in the order written (`docs/spec.md` §11). */
export function readTables(ctx: Ctx, node: Node, path: Path): Table[] {
  const what = entryOf('tables');

  return readEach(ctx, node, path, '`tables`', (site: Site) => {
    const opened = openEntries(site.ctx, site.node, site.path, what);
    if (opened === null) return null;

    for (const entry of opened.entries) {
      if (!MODELED_KEYS.table.has(keyOf(entry))) {
        rejectUnknownKey(opened.ctx, entry, what, MODELED_KEYS.table);
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
    if (at === null) return null;

    const named = findEntry(opened.entries, 'name');
    const styled = findEntry(opened.entries, 'style');

    return {
      ...identify(opened.ctx, opened.path, opened.node.span),
      at,
      name: named === undefined ? null : expectText(opened.ctx, named.value, under(what, 'name')),
      style:
        styled === undefined ? null : expectText(opened.ctx, styled.value, under(what, 'style')),
      bandedRows: flag(opened, 'banded_rows', what, true),
      bandedColumns: flag(opened, 'banded_columns', what, false),
      firstColumn: flag(opened, 'first_column', what, false),
      lastColumn: flag(opened, 'last_column', what, false),
    };
  });
}
