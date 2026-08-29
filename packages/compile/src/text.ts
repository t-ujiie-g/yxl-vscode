import { type Book, type Nothing, type Saying, speaking, type Words } from '@yxl-vscode/diag';

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
  'compile.bad-table': { file: string; problem: Saying };
  'compile.csv-unclosed-quote': Nothing;
  'compile.invalid-json': { why: string };
  'compile.json-must-be-an-array': Nothing;
  'compile.row-is-an-array': { at: number };
  'compile.row-must-be-a-row': { at: number };
  'compile.row-needs-columns': { at: number };
  'compile.row-has-no-field': { at: number; name: string };
  'compile.field-is-not-a-value': { at: number };
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
  'compile.bad-table': ({ file, problem }, worded) => `\`${file}\`: ${worded(problem)}`,
  'compile.csv-unclosed-quote': () => 'the CSV ends inside a quoted field',
  'compile.invalid-json': ({ why }) => `invalid JSON: ${why}`,
  'compile.json-must-be-an-array': () => 'a JSON table must be an array of rows',
  'compile.row-is-an-array': ({ at }) =>
    `\`columns\` names the fields of objects, but row ${at} is an array`,
  'compile.row-must-be-a-row': ({ at }) =>
    `row ${at} of a JSON table must be an array or an object`,
  'compile.row-needs-columns': ({ at }) =>
    `row ${at} is an object, so \`columns\` must name the fields to take (object key order is not dependable)`,
  'compile.row-has-no-field': ({ at, name }) => `row ${at} has no field \`${name}\``,
  'compile.field-is-not-a-value': ({ at }) =>
    `row ${at} has a field that is an array or an object; a cell holds a string, a number, a boolean, or null`,
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
  'compile.bad-table': ({ file, problem }, worded) => `${worded(problem)}（\`${file}\`）`,
  'compile.csv-unclosed-quote': () => 'CSV が引用符の途中で終わっています',
  'compile.invalid-json': ({ why }) => `JSON が不正です: ${why}`,
  'compile.json-must-be-an-array': () => 'JSON のテーブルは行の配列である必要があります',
  'compile.row-is-an-array': ({ at }) =>
    `\`columns\` はオブジェクトのフィールドを指しますが、${at} 行目は配列です`,
  'compile.row-must-be-a-row': ({ at }) =>
    `JSON テーブルの ${at} 行目は配列かオブジェクトである必要があります`,
  'compile.row-needs-columns': ({ at }) =>
    `${at} 行目はオブジェクトなので、取り出すフィールドを \`columns\` で指定する必要があります（オブジェクトのキー順は当てにできません）`,
  'compile.row-has-no-field': ({ at, name }) =>
    `${at} 行目に \`${name}\` というフィールドがありません`,
  'compile.field-is-not-a-value': ({ at }) =>
    `${at} 行目に配列またはオブジェクトのフィールドがあります。セルが持てるのは文字列・数値・真偽値・null です`,
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
