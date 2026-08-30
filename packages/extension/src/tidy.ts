import { compile } from '@yxl-vscode/compile';
import { type Parsed, parse } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { load } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import { applyPatch } from '@yxl-vscode/patch';
import {
  type Gathering,
  gatherPatch,
  type Merging,
  mergePatch,
  type Proposal,
  proposals,
  rangePatch,
  sites,
} from '@yxl-vscode/refactor';
import { type FilePath, filePath, styleName } from '@yxl-vscode/units';
import { type Checked, checked, nothingChanges } from '@yxl-vscode/verify';
import * as vscode from 'vscode';
import { asOpen, put } from './documents';
import { say } from './text';
import { reader } from './words';
import { moved } from './write';

/** The scheme the right-hand side of the proposal's diff is served under. */
export const PROPOSED = 'yxl-proposal';

const held = new Map<string, string>();

/** Everything this editor can say, in the reader's own language. */
type Words = (saying: Saying) => string;

/** A proposal the reader has answered: what to write, and what to call it. */
interface Taken {
  readonly patch: Patch;
  readonly label: string;
}

/** What a proposal's diff shows: held only while the diff is open on it. */
export const proposedText: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent: (uri) => held.get(uri.path) ?? '',
};

/**
 * A tidy-up offered over the spec in front of the reader: worked out, checked
 * against the claim that it changes no rendered cell, and shown as a diff —
 * applied only when the reader says so (ADR-053).
 */
export async function tidy(document: vscode.TextDocument): Promise<void> {
  const words = reader(vscode.env.language);
  const root = filePath(document.uri.fsPath);
  if (root === null) return;

  const source = document.getText();
  const found = offered(root, source);
  if (found.length === 0) {
    void vscode.window.showInformationMessage(words(say('host.nothing-to-tidy')));
    return;
  }

  const one = await chosen(found, words);
  if (one === undefined) return;

  const decided = await taken(one, words);
  if (decided === null) return;

  const { patch, label } = decided;
  const gate = checked(source, patch, nothingChanges, { root, file: root, read: asOpen });
  if (gate.ok !== true) {
    void vscode.window.showWarningMessage(words(say('host.tidy-refused', { why: why(gate) })));
    return;
  }

  const after = applyPatch(source, patch, { file: root }).text;
  await review(document, one, label, after, words);
}

/** Which cells a refused tidy-up would have moved, which is what makes it a refusal. */
function why(gate: Exclude<Checked, { ok: true }>): string {
  const cells = moved(gate.surprises);
  if (cells.length > 0) return cells.join(', ');

  return gate.ok === false ? gate.diagnostics.map((one) => one.code).join(', ') : '';
}

/** Every tidy-up this spec allows, from the files as the reader has them. */
function offered(root: FilePath, source: string): readonly Proposal[] {
  const trees = new Map<FilePath, Parsed | null>();
  const parsed = (file: FilePath): Parsed | null => {
    if (!trees.has(file)) {
      const text = file === root ? source : (asOpen(root, file)?.source ?? null);
      trees.set(file, text === null ? null : parse(text, { file }));
    }
    return trees.get(file) ?? null;
  };

  const tree = parsed(root);
  if (tree === null) return [];

  const { doc } = load(tree, asOpen);
  if (doc === null) return [];

  return proposals({ doc, grid: compile(doc, { read: asOpen }), parsed });
}

/** The one the reader picked, where more than one is offered. */
async function chosen(found: readonly Proposal[], words: Words): Promise<Proposal | undefined> {
  if (found.length === 1) return found[0];

  const picked = await vscode.window.showQuickPick(
    found.map((one) => ({ label: words(one.what), description: `${sites(one)}`, one })),
    { placeHolder: words(say('host.nothing-to-tidy')) },
  );

  return picked?.one;
}

/** What the reader decided, or `null` where they took the question back; a range asks nothing. */
async function taken(one: Proposal, words: Words): Promise<Taken | null> {
  if (one.kind === 'range') return { patch: rangePatch(one), label: one.over };

  const name = one.kind === 'gather' ? await named(one, words) : await kept(one, words);
  if (name === null) return null;

  const patch = one.kind === 'gather' ? gatherPatch(one, name) : mergePatch(one, name);
  return { patch, label: name };
}

/** Which of the definitions that say the same thing is the one to leave standing. */
async function kept(one: Merging, words: Words) {
  const said = await vscode.window.showQuickPick([...one.names], {
    placeHolder: words(say('host.keep-which-definition')),
  });

  return said === undefined ? null : styleName(said);
}

/** A name for a look nothing declares yet, refused where it already means something else. */
async function named(one: Gathering, words: Words) {
  const taken = new Set<string>(one.taken);
  const said = await vscode.window.showInputBox({
    prompt: words(say('host.name-the-look')),
    value: one.suggested,
    validateInput: (text) => {
      if (styleName(text.trim()) === null) return words(say('host.not-a-name'));
      return taken.has(text.trim())
        ? words(say('host.name-is-taken', { name: text.trim() }))
        : null;
    },
  });

  return said === undefined ? null : styleName(said.trim());
}

/** The diff, and the write behind it: nothing is put until the reader agrees to it. */
async function review(
  document: vscode.TextDocument,
  one: Proposal,
  label: string,
  after: string,
  words: Words,
): Promise<void> {
  const key = `/${label}-${Date.now()}.yxl.yaml`;
  held.set(key, after);

  try {
    await vscode.commands.executeCommand(
      'vscode.diff',
      document.uri,
      vscode.Uri.from({ scheme: PROPOSED, path: key }),
      `${vscode.workspace.asRelativePath(document.uri)} ↔ ${label}`,
    );

    const apply = words(say('host.apply'));
    const answer = await vscode.window.showInformationMessage(
      words(say('host.apply-the-tidy-up', { what: one.what })),
      { modal: true },
      apply,
    );
    if (answer !== apply) return;

    const root = filePath(document.uri.fsPath);
    if (root === null) return;

    await put(root, after);
    void vscode.window.showInformationMessage(
      words(say('host.tidied', { name: label, sites: sites(one) })),
    );
  } finally {
    held.delete(key);
  }
}
