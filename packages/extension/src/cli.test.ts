import { describe, expect, it } from 'vitest';
import { run, versionOf, versionWarning } from './cli';

describe('versionOf', () => {
  it('reads what `yxl version` answers', () => {
    expect(versionOf('yxl 0.3.5')).toBe('0.3.5');
  });

  it('is nothing when the answer holds no version', () => {
    expect(versionOf('command not found')).toBeNull();
  });
});

describe('what to say about the compiler that is installed', () => {
  it('says nothing when it is the one this editor targets', () => {
    expect(versionWarning('0.3.5', '0.3.5')).toBeNull();
  });

  it('warns that an older one may not have the construct', () => {
    expect(versionWarning('0.3.4', '0.3.5')).toContain('older');
  });

  it('warns that a newer one may have moved the schema, and still builds', () => {
    const said = versionWarning('0.4.0', '0.3.5');
    expect(said).toContain('newer');
    expect(said).toContain('still builds');
  });

  it('compares by number, not by text', () => {
    // `0.10.0` is newer than `0.9.0`, which string order gets backwards.
    expect(versionWarning('0.10.0', '0.9.0')).toContain('newer');
    expect(versionWarning('0.9.0', '0.10.0')).toContain('older');
  });

  it('says so when the compiler did not answer', () => {
    expect(versionWarning(null, '0.3.5')).toContain('did not say');
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
