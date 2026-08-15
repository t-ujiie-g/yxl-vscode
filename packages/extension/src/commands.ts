import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { run, versionOf, versionWarning } from './cli';

/** Where yxl is installed, and how to get one. */
const INSTALL = 'https://github.com/t-ujiie-g/yxl#install';

/**
 * The compiler, run from the editor: check a spec, or build the workbook.
 *
 * `yxl build --check` is the validator of record (ADR-011), so this is how a
 * reader hears what the preview deliberately does not say — an undefined
 * reference, a sheet name Excel will refuse, anything this editor carries
 * without understanding.
 */
export class Compiler {
  private readonly output = vscode.window.createOutputChannel('yxl');
  private warned = false;

  constructor(private readonly target: string) {}

  dispose(): void {
    this.output.dispose();
  }

  async check(spec: vscode.Uri): Promise<void> {
    const ran = await this.ask(['build', spec.fsPath, '--check']);
    if (ran === null) return;

    if (ran.ok) void vscode.window.showInformationMessage(`${basename(spec.fsPath)}: ok`);
    else this.show(ran.said);
  }

  async build(spec: vscode.Uri): Promise<void> {
    const workbook = join(dirname(spec.fsPath), `${basename(spec.fsPath, '.yaml')}.xlsx`).replace(
      /\.yxl\.xlsx$/,
      '.xlsx',
    );

    const ran = await this.ask(['build', spec.fsPath, '-o', workbook]);
    if (ran === null) return;

    if (!ran.ok) {
      this.show(ran.said);
      return;
    }

    const open = await vscode.window.showInformationMessage(
      `Built ${basename(workbook)}`,
      'Open it',
    );
    if (open !== undefined) await vscode.env.openExternal(vscode.Uri.file(workbook));
  }

  /**
   * Run the compiler, having said what is worth saying about it first: a
   * missing one, or one that is not the version this editor targets.
   */
  private async ask(args: readonly string[]): Promise<{ ok: boolean; said: string } | null> {
    const binary = vscode.workspace.getConfiguration('yxl').get<string>('path') ?? 'yxl';
    this.output.appendLine(`$ ${binary} ${args.join(' ')}`);

    await this.checkVersion(binary);
    const ran = await run(binary, args);
    if (ran === null) {
      this.missing(binary);
      return null;
    }

    this.output.appendLine(ran.said);
    return ran;
  }

  /** Said once per session: a warning about the version, never a refusal. */
  private async checkVersion(binary: string): Promise<void> {
    if (this.warned) return;
    this.warned = true;

    const ran = await run(binary, ['version']);
    if (ran === null) return;

    const warning = versionWarning(versionOf(ran.said), this.target);
    if (warning !== null) void vscode.window.showWarningMessage(warning);
  }

  private missing(binary: string): void {
    const message = `Could not run \`${binary}\`. Install yxl, or set \`yxl.path\` to it.`;
    void vscode.window.showErrorMessage(message, 'How to install').then((chosen) => {
      if (chosen !== undefined) void vscode.env.openExternal(vscode.Uri.parse(INSTALL));
    });
  }

  private show(said: string): void {
    this.output.show(true);
    void vscode.window.showErrorMessage(said.split('\n')[0] ?? 'yxl refused the spec.');
  }
}
