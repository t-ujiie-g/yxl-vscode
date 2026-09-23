import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { folderOf, installation, older, run, versionOf, versionWarning } from './cli';
import { reader } from './words';

const english = reader('en');

describe('versionOf', () => {
  it('reads what `yxl version` answers', () => {
    expect(versionOf('yxl 0.3.6')).toBe('0.3.6');
  });

  it('is nothing when the answer holds no version', () => {
    expect(versionOf('command not found')).toBeNull();
  });
});

describe('what to say about the compiler that is installed', () => {
  it('says nothing when it is the one this editor targets', () => {
    expect(versionWarning('0.3.6', '0.3.6')).toBeNull();
  });

  it('warns that an older one may not have the construct', () => {
    expect(english(versionWarning('0.3.5', '0.3.6') ?? '')).toContain('older');
  });

  it('warns that a newer one may have moved the schema, and still builds', () => {
    const said = english(versionWarning('0.4.0', '0.3.6') ?? '');
    expect(said).toContain('newer');
    expect(said).toContain('still builds');
  });

  it('compares by number, not by text', () => {
    // `0.10.0` is newer than `0.9.0`, which string order gets backwards.
    expect(english(versionWarning('0.10.0', '0.9.0') ?? '')).toContain('newer');
    expect(english(versionWarning('0.9.0', '0.10.0') ?? '')).toContain('older');
    expect([older('0.10.0', '0.9.0'), older('0.9.0', '0.10.0')]).toEqual([false, true]);
  });

  it('says so when the compiler did not answer', () => {
    expect(english(versionWarning(null, '0.3.6') ?? '')).toContain('did not say');
  });
});

describe('running the compiler', () => {
  it('is nothing at all when there is no compiler to run', () => {
    // The difference that matters: a missing binary is a message about
    // installing yxl, and a refused spec is a message about the spec.
    expect(run('a-binary-that-is-not-installed', ['version'])).resolves.toBeNull();
  });

  it('comes back with what a real command said', async () => {
    const ran = await run('node', ['--version']);
    expect(ran?.ok).toBe(true);
    expect(ran?.said).toMatch(/^v\d+\./);
  });

  it('comes back not ok, with the output, when the command failed', async () => {
    const ran = await run('node', ['--this-flag-does-not-exist']);
    expect(ran?.ok).toBe(false);
    expect(ran?.said).not.toBe('');
  });
});

describe('the line that installs the targeted yxl', () => {
  it('runs the installer from that release tag, told the version and the folder', () => {
    expect(installation('0.5.0', false, '/home/me/.local/bin')).toEqual({
      shell: '/bin/sh',
      args: ['-c'],
      line: "(curl -fsSL 'https://raw.githubusercontent.com/t-ujiie-g/yxl/v0.5.0/install.sh' || wget -qO- 'https://raw.githubusercontent.com/t-ujiie-g/yxl/v0.5.0/install.sh') | YXL_VERSION='0.5.0' YXL_INSTALL_DIR='/home/me/.local/bin' sh",
    });
  });

  it('leaves the folder to the installer where there is no yxl to replace', () => {
    expect(installation('0.5.0', false, null).line).toMatch(/YXL_VERSION='0\.5\.0' sh$/);
  });

  it('quotes a folder so that nothing in its name reaches the shell as a command', () => {
    expect(installation('0.5.0', false, "/tmp/it's; rm -rf ~").line).toContain(
      "YXL_INSTALL_DIR='/tmp/it'\\''s; rm -rf ~' sh",
    );
    expect(installation('0.5.0', true, "C:\\it's").line).toContain(
      "$env:YXL_INSTALL_DIR='C:\\it''s'; ",
    );
  });

  it("runs Windows' own installer under PowerShell", () => {
    expect(installation('0.5.0', true, null)).toEqual({
      shell: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'],
      line: "$env:YXL_VERSION='0.5.0'; irm 'https://raw.githubusercontent.com/t-ujiie-g/yxl/v0.5.0/install.ps1' | iex",
    });
  });
});

describe('the folder the compiler is in', () => {
  it("is an absolute path's own folder", () => {
    expect(folderOf('/opt/yxl/bin/yxl', '', false)).toBe('/opt/yxl/bin');
  });

  it('is the first folder on the path that holds an executable of that name', () => {
    const empty = mkdtempSync(join(tmpdir(), 'yxl-path-'));
    const holding = mkdtempSync(join(tmpdir(), 'yxl-path-'));
    const later = mkdtempSync(join(tmpdir(), 'yxl-path-'));
    for (const dir of [holding, later]) {
      writeFileSync(join(dir, 'yxl'), '');
      chmodSync(join(dir, 'yxl'), 0o755);
    }

    expect(folderOf('yxl', [empty, holding, later].join(delimiter), false)).toBe(holding);
  });

  it('is nothing where no folder on the path holds it', () => {
    expect(folderOf('yxl', mkdtempSync(join(tmpdir(), 'yxl-path-')), false)).toBeNull();
  });
});
