import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './corpus';

/**
 * What the editor contributes to VS Code, which no other suite can see: a
 * command named in a menu and declared nowhere is a button that does nothing,
 * and one in the title bar with no icon is the text button a reader could not
 * place.
 */
const EXTENSION = join(REPO_ROOT, 'packages/extension');

interface Manifest {
  readonly contributes: {
    readonly commands: readonly { command: string; title: string; icon?: string }[];
    readonly menus: Record<string, readonly { command: string; group?: string; when?: string }[]>;
    readonly keybindings: readonly { command: string }[];
  };
}

const manifest = JSON.parse(readFileSync(join(EXTENSION, 'package.json'), 'utf8')) as Manifest;
const { commands, menus, keybindings } = manifest.contributes;

/** Every command the extension actually registers, read from where it registers them. */
function registered(): string[] {
  const source = readFileSync(join(EXTENSION, 'src/extension.ts'), 'utf8');
  return [...source.matchAll(/registerCommand\('([^']+)'/g)].map((one) => one[1] ?? '');
}

describe('what this editor contributes to VS Code', () => {
  it('declares every command a menu names, or the menu holds a button that does nothing', () => {
    const named = Object.values(menus)
      .flat()
      .map((one) => one.command);
    const declared = new Set(commands.map((one) => one.command));

    expect([...new Set(named)].filter((one) => !declared.has(one))).toEqual([]);
  });

  it('registers every command it declares, and every command a key names', () => {
    // The other way round is not a rule: `yxl.keepKey` is registered and bound
    // and deliberately undeclared, since a key taken from VS Code is not an
    // offer to a reader (ADR-046).
    const held = new Set(registered());
    const named = [...commands, ...keybindings].map((one) => one.command);

    expect([...new Set(named)].filter((one) => !held.has(one))).toEqual([]);
  });

  it('gives every button in a title bar an icon, or it is a line of text there', () => {
    const bare = (menus['editor/title'] ?? [])
      .filter((one) => one.group === 'navigation')
      .map((one) => commands.find((it) => it.command === one.command))
      .filter((one) => one?.icon === undefined);

    expect(bare).toEqual([]);
  });

  it('offers what acts on a spec wherever a reader is looking at one', () => {
    // The text and the grid are two views of one spec, so a command about the
    // spec belongs in both title bars — which is where a reader looks for it.
    const both = (menu: string, command: string): boolean =>
      (menus[menu] ?? [])
        .filter((one) => one.command === command)
        .some(
          (one) =>
            (one.when ?? '').includes('resourceFilename') &&
            (one.when ?? '').includes('activeWebviewPanelId'),
        );

    expect(both('editor/title', 'yxl.build')).toBe(true);
    expect(both('editor/title', 'yxl.check')).toBe(true);
    expect(both('commandPalette', 'yxl.build')).toBe(true);
  });

  it('names what a command opens, since the palette says `yxl` for it already', () => {
    const preview = commands.find((one) => one.command === 'yxl.showPreview');
    expect(preview?.title).toContain('Grid');
    expect(preview?.title).not.toContain('yxl');
  });
});
