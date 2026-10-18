import type { Entry, Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { MODELED_KEYS, type Note } from '@yxl-vscode/spec';
import { readListed } from './anchor';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import { expectText, findEntry, type Opened, open, openEntries } from './read';
import { ADDRESS, readTextAs } from './template';
import { about, entryOf, say, under } from './text';

/** A sheet's `comments:`: one note per addressed cell, or a list whose entries carry their own `at:` (`docs/spec.md` §10). */
export function readNotes(ctx: Ctx, node: Node, path: Path): Note[] {
  if (node.kind === 'seq') {
    return readListed(ctx, node, path, about('note', ''), MODELED_KEYS.listedNote, (opened, at) => {
      const written = fromEntries(opened, about('note', ''));
      return written === null ? null : { at, listed: true, ...written };
    });
  }

  const opened = openEntries(ctx, node, path, '`comments`');
  if (opened === null) return [];

  const notes: Note[] = [];
  for (const entry of opened.entries) {
    const note = readNote(opened.ctx, entry, opened.path);
    if (note !== null) notes.push(note);
  }
  return notes;
}

function readNote(ctx: Ctx, entry: Entry, path: Path): Note | null {
  const key = keyOf(entry);
  const at = readTextAs(ctx, key, entry.key.span, entryOf('comments'), ADDRESS);
  if (at === null) return null;

  const what = about('note', String(key));
  const site = identify(ctx, [...path, key], entry.span);

  if (entry.value.kind !== 'map') {
    const text = expectText(ctx, entry.value, what);
    return text === null ? null : { ...site, at, listed: false, text, author: null };
  }

  const opened = open({ ctx, node: entry.value, path: [] }, what, MODELED_KEYS.note);
  if (opened === null) return null;

  const written = fromEntries(opened, what);
  return written === null ? null : { ...site, at, listed: false, ...written };
}

/** The `{ text:, author: }` form; a note written that way needs its `text` (`docs/spec.md` §10). */
function fromEntries(opened: Opened, what: Saying): { text: string; author: string | null } | null {
  const here = opened.ctx;
  const written = findEntry(opened.entries, 'text');
  if (written === undefined) {
    reject(here, CODE.missingKey, say('loader.needs', { what, key: 'text' }), opened.node.span);
    return null;
  }

  const text = expectText(here, written.value, under(what, 'text'));
  const named = findEntry(opened.entries, 'author');
  const author = named === undefined ? null : expectText(here, named.value, under(what, 'author'));

  return text === null ? null : { text, author };
}
