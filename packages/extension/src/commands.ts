import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { Message } from '@yxl-vscode/diag';
import * as vscode from 'vscode';
import { folderOf, installation, older, run, versionOf, versionWarning } from './cli';
import { say } from './text';
import { reader } from './words';

/** Where a spec goes when nothing says otherwise: the folder that is open, or the reader's own. */
function folder(): vscode.Uri {
  const open = vscode.workspace.workspaceFolders?.[0]?.uri;
  return open ?? vscode.Uri.file(homedir());
}

/** The yxl that first had `init`; an older one is told so rather than left to complain (`ROADMAP.md` Phase 18). */
const INIT_SINCE = '0.3.6';

/** Where yxl is installed, and how to get one. */
const INSTALL = 'https://github.com/t-ujiie-g/yxl#install';

/** The extension version the compiler was last checked for, kept across sessions. */
const CHECKED_FOR = 'yxl.checkedFor';

/** The compiler, run from the editor: check a spec or build the workbook — the validator of record (ADR-011). */
export class Compiler {
  private readonly output = vscode.window.createOutputChannel('yxl');
  private readonly worded = reader(vscode.env.language);
  private warned = false;

  constructor(private readonly target: string) {}

  dispose(): void {
    this.output.dispose();
  }

  async check(spec: vscode.Uri): Promise<void> {
    const ran = await this.ask(['build', spec.fsPath, '--check']);
    if (ran === null) return;

    if (ran.ok) this.tell(say('host.spec-is-ok', { file: basename(spec.fsPath) }));
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
      this.worded(say('host.built', { file: basename(workbook) })),
      this.worded(say('host.open-it')),
    );
    if (open !== undefined) await vscode.env.openExternal(vscode.Uri.file(workbook));
  }

  /** A spec with one empty sheet, written by the compiler: the starter is upstream's (ADR-011). */
  async init(into: vscode.Uri | undefined): Promise<vscode.Uri | null> {
    const where = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(into ?? folder(), 'book.yxl.yaml'),
      filters: { [this.worded(say('host.a-yxl-spec'))]: ['yxl.yaml', 'yaml'] },
      saveLabel: this.worded(say('host.create')),
    });
    if (where === undefined) return null;

    // The dialog has already asked about overwriting, and `init` refuses on its
    // own without being told.
    const ran = await this.ask(['init', '-o', where.fsPath, '--force']);
    if (ran === null) return null;
    if (!ran.ok) {
      if (!(await this.tooOldToInit())) this.show(ran.said);
      return null;
    }

    return where;
  }

  /** Whether the compiler came before `init` did, said plainly rather than as its own complaint. */
  private async tooOldToInit(): Promise<boolean> {
    const found = versionOf((await run(this.binary(), ['version']))?.said ?? '');
    if (found === null || !older(found, INIT_SINCE)) return false;

    void vscode.window.showErrorMessage(
      this.worded(say('host.no-init', { found, since: INIT_SINCE })),
    );
    return true;
  }

  /** Run the compiler, having first said what is worth saying: it is missing, or it is not the pinned version. */
  private async ask(args: readonly string[]): Promise<{ ok: boolean; said: string } | null> {
    const binary = this.binary();
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

  /** Saying once per session: a warning about the version, never a refusal. */
  private async checkVersion(binary: string): Promise<void> {
    if (this.warned) return;
    this.warned = true;

    const ran = await run(binary, ['version']);
    if (ran === null) return;

    const found = versionOf(ran.said);
    const warning = versionWarning(found, this.target);
    if (warning === null) return;

    if (found !== null && older(found, this.target)) this.offerUpdate(warning);
    else void vscode.window.showWarningMessage(this.worded(warning));
  }

  /** The compiler checked once per version of this extension, an update offered where it is older than the pin. */
  async checkAfterInstall(state: vscode.Memento, version: string): Promise<void> {
    if (state.get<string>(CHECKED_FOR) === version) return;
    await state.update(CHECKED_FOR, version);
    this.warned = true;

    const binary = this.binary();
    const ran = await run(binary, ['version']);
    if (ran === null) {
      this.missing(binary);
      return;
    }

    const found = versionOf(ran.said);
    if (found !== null && older(found, this.target)) {
      this.offerUpdate(say('host.older-compiler', { found, target: this.target }));
    }
  }

  /** A warning with the update beside it; nothing is installed until the reader says so. */
  private offerUpdate(warning: Message): void {
    const update = this.worded(say('host.update-yxl', { target: this.target }));
    void vscode.window.showWarningMessage(this.worded(warning), update).then((chosen) => {
      if (chosen === update) void this.install();
    });
  }

  /** yxl's own installer for the pinned version, run as a task the reader watches, then the version asked again. */
  private async install(): Promise<void> {
    const binary = this.binary();
    const windows = process.platform === 'win32';
    const { PATH } = process.env;
    const how = installation(this.target, windows, folderOf(binary, PATH ?? '', windows));
    this.output.appendLine(`$ ${how.line}`);

    const task = new vscode.Task(
      { type: 'shell' },
      vscode.TaskScope.Global,
      `install yxl ${this.target}`,
      'yxl',
      new vscode.ShellExecution(how.line, { executable: how.shell, shellArgs: [...how.args] }),
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.New,
    };

    let execution: vscode.TaskExecution;
    try {
      execution = await vscode.tasks.executeTask(task);
    } catch {
      await vscode.env.clipboard.writeText(how.line);
      void vscode.window.showWarningMessage(this.worded(say('host.install-by-hand')));
      return;
    }

    const code = await new Promise<number | undefined>((done) => {
      const listening = vscode.tasks.onDidEndTaskProcess((ended) => {
        if (ended.execution !== execution) return;
        listening.dispose();
        done(ended.exitCode);
      });
    });
    if (code !== 0) {
      void vscode.window.showErrorMessage(this.worded(say('host.install-failed')));
      return;
    }

    const found = versionOf((await run(binary, ['version']))?.said ?? '');
    if (found === this.target) {
      this.tell(say('host.yxl-installed', { found }));
      return;
    }
    void vscode.window.showWarningMessage(
      this.worded(say('host.still-another-yxl', { found: found ?? '?', target: this.target })),
    );
  }

  /** The compiler this editor runs: a bare name is looked up on `PATH`, an absolute path used as given. */
  private binary(): string {
    return vscode.workspace.getConfiguration('yxl').get<string>('path') ?? 'yxl';
  }

  private missing(binary: string): void {
    const message = this.worded(say('host.no-compiler', { binary }));
    const install = this.worded(say('host.install-yxl', { target: this.target }));
    const how = this.worded(say('host.how-to-install'));
    void vscode.window.showErrorMessage(message, install, how).then((chosen) => {
      if (chosen === install) void this.install();
      if (chosen === how) void vscode.env.openExternal(vscode.Uri.parse(INSTALL));
    });
  }

  /** A line the reader is told, in their own language (ADR-051). */
  private tell(said: Message): void {
    void vscode.window.showInformationMessage(this.worded(said));
  }

  private show(said: string): void {
    this.output.show(true);
    void vscode.window.showErrorMessage(
      said.split('\n')[0] ?? this.worded(say('host.refused-the-spec')),
    );
  }
}
