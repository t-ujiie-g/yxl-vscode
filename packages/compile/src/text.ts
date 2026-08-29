import { type Book, type Nothing, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'compile.not-a-cell-reference': { spelled: string };
  'compile.not-a-range': { spelled: string };
  'compile.not-a-column': { spelled: string };
  'compile.not-a-row': { spelled: string };
  'compile.not-a-sheet-and-a-cell': { spelled: string };
  'compile.not-a-hex-colour': { spelled: string };
  'compile.not-a-date': { value: string };
  'compile.not-an-elapsed-time': { value: string };
  'compile.not-one-of': { spelled: string; choices: string };
  'compile.no-such-value': { name: string };
  'compile.no-such-formula': { name: string };
  'compile.no-such-sheet': { name: string };
  'compile.no-such-style': { name: string };
  'compile.no-such-param': { name: string };
  'compile.no-param-to-set': { name: string };
  'compile.param-cycle': { cycle: string };
  'compile.style-cycle': { cycle: string };
  'compile.unclosed-placeholder': Nothing;
  'compile.data-needs-a-path': Nothing;
  'compile.nothing-can-read': { path: string };
  'compile.cannot-read': { path: string };
  'compile.bad-table': { file: string; problem: string };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'compile.not-a-cell-reference': ({ spelled }) => `\`${spelled}\` is not a cell reference`,
  'compile.not-a-range': ({ spelled }) => `\`${spelled}\` is not a range`,
  'compile.not-a-column': ({ spelled }) => `\`${spelled}\` is not a column or a range of columns`,
  'compile.not-a-row': ({ spelled }) => `\`${spelled}\` is not a row or a range of rows`,
  'compile.not-a-sheet-and-a-cell': ({ spelled }) => `\`${spelled}\` is not a sheet and a cell`,
  'compile.not-a-hex-colour': ({ spelled }) => `\`${spelled}\` is not a hex colour`,
  'compile.not-a-date': ({ value }) => `\`${value}\` is not a date`,
  'compile.not-an-elapsed-time': ({ value }) => `\`${value}\` is not an elapsed time`,
  'compile.not-one-of': ({ spelled, choices }) => `\`${spelled}\` is not one of ${choices}`,
  'compile.no-such-value': ({ name }) => `no value is declared as \`${name}\``,
  'compile.no-such-formula': ({ name }) => `no formula is declared as \`${name}\``,
  'compile.no-such-sheet': ({ name }) => `no sheet is named \`${name}\``,
  'compile.no-such-style': ({ name }) => `no style is declared as \`${name}\``,
  'compile.no-such-param': ({ name }) => `no parameter is declared as \`${name}\``,
  'compile.no-param-to-set': ({ name }) => `this spec declares no parameter \`${name}\` to set`,
  'compile.param-cycle': ({ cycle }) => `a parameter's default comes back round: ${cycle}`,
  'compile.style-cycle': ({ cycle }) => `a style extends its way back round: ${cycle}`,
  'compile.unclosed-placeholder': () => 'a `${` is never closed',
  'compile.data-needs-a-path': () => 'a `data` entry needs a path',
  'compile.nothing-can-read': ({ path }) => `nothing here can read \`${path}\``,
  'compile.cannot-read': ({ path }) => `cannot read \`${path}\``,
  'compile.bad-table': ({ file, problem }) => `\`${file}\`: ${problem}`,
};

const ja: Words<Says> = {
  'compile.not-a-cell-reference': ({ spelled }) => `\`${spelled}\` はセル参照ではありません`,
  'compile.not-a-range': ({ spelled }) => `\`${spelled}\` は範囲ではありません`,
  'compile.not-a-column': ({ spelled }) => `\`${spelled}\` は列または列の範囲ではありません`,
  'compile.not-a-row': ({ spelled }) => `\`${spelled}\` は行または行の範囲ではありません`,
  'compile.not-a-sheet-and-a-cell': ({ spelled }) =>
    `\`${spelled}\` はシートとセルの組ではありません`,
  'compile.not-a-hex-colour': ({ spelled }) => `\`${spelled}\` は 16 進の色ではありません`,
  'compile.not-a-date': ({ value }) => `\`${value}\` は日付ではありません`,
  'compile.not-an-elapsed-time': ({ value }) => `\`${value}\` は経過時間ではありません`,
  'compile.not-one-of': ({ spelled, choices }) =>
    `\`${spelled}\` は ${choices} のいずれでもありません`,
  'compile.no-such-value': ({ name }) => `\`${name}\` という名前の値は宣言されていません`,
  'compile.no-such-formula': ({ name }) => `\`${name}\` という名前の数式は宣言されていません`,
  'compile.no-such-sheet': ({ name }) => `\`${name}\` という名前のシートはありません`,
  'compile.no-such-style': ({ name }) => `\`${name}\` という名前のスタイルは宣言されていません`,
  'compile.no-such-param': ({ name }) => `\`${name}\` という名前のパラメータは宣言されていません`,
  'compile.no-param-to-set': ({ name }) =>
    `この spec は \`${name}\` というパラメータを宣言していないため、設定できません`,
  'compile.param-cycle': ({ cycle }) => `パラメータの既定値が循環しています: ${cycle}`,
  'compile.style-cycle': ({ cycle }) => `スタイルの継承が循環しています: ${cycle}`,
  'compile.unclosed-placeholder': () => '`${` が閉じられていません',
  'compile.data-needs-a-path': () => '`data` のエントリにはパスが必要です',
  'compile.nothing-can-read': ({ path }) => `ここでは \`${path}\` を読めません`,
  'compile.cannot-read': ({ path }) => `\`${path}\` を読めません`,
  'compile.bad-table': ({ file, problem }) => `${problem}（\`${file}\`）`,
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
