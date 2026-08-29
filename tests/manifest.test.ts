import { existsSync, readFileSync } from 'node:fs';
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
  readonly name: string;
  readonly version: string;
  readonly publisher?: string;
  readonly private?: boolean;
  readonly icon?: string;
  readonly repository?: { url: string };
  readonly license?: string;
  readonly contributes: {
    readonly commands: readonly { command: string; title: string; icon?: string }[];
    readonly menus: Record<string, readonly { command: string; group?: string; when?: string }[]>;
    readonly keybindings: readonly { command: string }[];
  };
}

const manifest = JSON.parse(readFileSync(join(EXTENSION, 'package.json'), 'utf8')) as Manifest;
const { commands, menus, keybindings } = manifest.contributes;

/** One of VS Code's own translation files, which is where the manifest's `%key%` are answered (ADR-051). */
function nls(language: string): Record<string, string> {
  const name = language === 'en' ? 'package.nls.json' : `package.nls.${language}.json`;
  return JSON.parse(readFileSync(join(EXTENSION, name), 'utf8')) as Record<string, string>;
}

/** Every `%key%` the manifest asks for, wherever it is written. */
function asked(): string[] {
  const source = readFileSync(join(EXTENSION, 'package.json'), 'utf8');
  return [...new Set([...source.matchAll(/%([\w.]+)%/g)].map((one) => one[1] ?? ''))];
}

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
    const title = commands.find((one) => one.command === 'yxl.showPreview')?.title ?? '';
    const preview = nls('en')[title.replaceAll('%', '')];
    expect(preview).toContain('Grid');
    expect(preview).not.toContain('yxl');
  });

  it('answers every `%key%` it asks for, in every language it says it reads', () => {
    for (const language of ['en', 'ja']) {
      const held = nls(language);
      expect(asked().filter((one) => held[one] === undefined)).toEqual([]);
    }
  });

  it('puts what makes a spec where VS Code puts new files, rather than in the palette alone', () => {
    // The palette is where a command goes to hide: a reader who wanted a new
    // spec looked in *New File…* and in the folder they were standing on.
    const inMenu = (menu: string): boolean =>
      (menus[menu] ?? []).some((one) => one.command === 'yxl.newSpec');

    expect([inMenu('file/newFile'), inMenu('explorer/context')]).toEqual([true, true]);
  });

  it('is publishable: what the marketplace refuses a package without', () => {
    expect({
      publisher: manifest.publisher,
      private: manifest.private,
      licence: manifest.license,
      repository: manifest.repository?.url,
    }).toEqual({
      publisher: 't-ujiie-g',
      private: undefined,
      licence: 'Apache-2.0',
      repository: 'https://github.com/t-ujiie-g/yxl-vscode.git',
    });
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ships what a listing is read from, and the icon it is found by', () => {
    const held = ['README.md', 'CHANGELOG.md', 'LICENSE', manifest.icon ?? ''];

    expect(held.filter((one) => !existsSync(join(EXTENSION, one)))).toEqual([]);
  });

  it('names the yxl it was built against, since a release is tied to the pin (§8 Q6)', () => {
    // The schema is not frozen until yxl's v1.0, so which compiler a version
    // targets is part of what the version means.
    const pinned = (
      JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
        yxl: { targetVersion: string };
      }
    ).yxl.targetVersion;

    for (const name of ['README.md', 'CHANGELOG.md']) {
      expect([name, readFileSync(join(EXTENSION, name), 'utf8').includes(pinned)]).toEqual([
        name,
        true,
      ]);
    }
  });

  it('says the same list in both languages, so neither can quietly fall behind', () => {
    expect(Object.keys(nls('ja')).sort()).toEqual(Object.keys(nls('en')).sort());
  });
});
