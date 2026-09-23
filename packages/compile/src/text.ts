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
  'compile.csv-has-no-header': Nothing;
  'compile.layout-has-no-columns': Nothing;
  'compile.no-such-block': { name: string };
  'compile.column-named-twice': { name: string };
  'compile.fields-names-no-input': { name: string };
  'compile.csv-has-no-field': { field: string; column: string };
  'compile.row-too-long': { at: number; fields: number; inputs: number };
  'compile.field-by-position': { column: string };
  'compile.field-with-no-file': { column: string };
  'compile.rows-fewer-than-data': { rows: number; data: number };
  'compile.layout-needs-rows': Nothing;
  'compile.rows-must-be-whole': Nothing;
  'compile.header-style-with-no-header': Nothing;
  'compile.no-such-column': { name: string };
  'compile.unclosed-column-ref': Nothing;
  'compile.text-spells-no-group': { name: string };
  'compile.not-an-input-column': { name: string };
  'compile.merges-leftward': { name: string; to: string };
  'compile.merges-over': { name: string; over: string };
  'compile.group-inside-itself': { name: string };
  'compile.group-needs-data': { name: string };
  'compile.order-lists-twice': { value: string };
  'compile.order-leaves-out': { value: string };
  'compile.no-such-layout': { name: string };
  'compile.layout-on-another-sheet': { name: string; sheet: string };
  'compile.layout-not-yet': { name: string };
  'compile.layout-named-twice': { name: string };
  'compile.gap-must-be-whole': Nothing;
  'compile.no-such-body-row': { row: number; rows: number };
  'compile.where-matches': { count: number };
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
  'compile.csv-has-no-header': () =>
    'a CSV a layout reads starts with a header row naming its fields, and this one is empty',
  'compile.layout-has-no-columns': () => 'a layout needs at least one column',
  'compile.no-such-block': ({ name }) => `no block is declared as \`${name}\` in \`defs.blocks\``,
  'compile.column-named-twice': ({ name }) => `the layout names two columns \`${name}\``,
  'compile.fields-names-no-input': ({ name }) =>
    `\`fields\` names \`${name}\`, which is not a column of the block the data fills`,
  'compile.csv-has-no-field': ({ field, column }) =>
    `the CSV's header row has no field \`${field}\` for column \`${column}\``,
  'compile.row-too-long': ({ at, fields, inputs }) =>
    `row ${at} has ${fields} fields, but the layout has ${inputs} columns without a formula to take them`,
  'compile.field-by-position': ({ column }) =>
    `column \`${column}\` has a \`field\`, but these rows are matched by position`,
  'compile.field-with-no-file': ({ column }) =>
    `column \`${column}\` has a \`field\`, but the layout reads no \`csv\` or \`json\``,
  'compile.rows-fewer-than-data': ({ rows, data }) =>
    `\`rows\` is ${rows}, fewer than the ${data} rows the data holds`,
  'compile.layout-needs-rows': () =>
    'a layout needs `rows`, or a `values`, `csv`, or `json` to count them from',
  'compile.rows-must-be-whole': () => '`rows` must be a whole number of at least 1',
  'compile.header-style-with-no-header': () =>
    'the layout has a `header_style`, but no column has a `header` to wear it',
  'compile.no-such-column': ({ name }) => `\`${name}\` is not a column of this layout`,
  'compile.unclosed-column-ref': () => 'a `{{` is never closed with `}}`',
  'compile.text-spells-no-group': ({ name }) =>
    `\`{{${name}}}\` in text can only spell the value of an enclosing \`by\` group`,
  'compile.not-an-input-column': ({ name }) =>
    `\`${name}\` must be a column the data fills (one without a \`formula\`)`,
  'compile.merges-leftward': ({ name, to }) =>
    `\`${name}\` merges to \`${to}\`, which is not to its right`,
  'compile.merges-over': ({ name, over }) =>
    `\`${name}\` merges over \`${over}\`, which the row also writes`,
  'compile.group-inside-itself': ({ name }) =>
    `the footer group \`${name}\` is nested inside itself`,
  'compile.group-needs-data': ({ name }) =>
    `the footer group \`${name}\` takes its values from the layout's data, and the layout reads none; list them in \`order\``,
  'compile.order-lists-twice': ({ value }) => `\`order\` lists \`${value}\` twice`,
  'compile.order-leaves-out': ({ value }) =>
    `\`order\` leaves out \`${value}\`, which the data holds; its rows would be in no subtotal`,
  'compile.no-such-layout': ({ name }) => `no layout is named \`${name}\``,
  'compile.layout-on-another-sheet': ({ name, sheet }) =>
    `the layout \`${name}\` is on the sheet \`${sheet}\`, not this one`,
  'compile.layout-not-yet': ({ name }) =>
    `the layout \`${name}\` is declared after the layout that follows it`,
  'compile.layout-named-twice': ({ name }) => `\`${name}\` is already the name of another layout`,
  'compile.gap-must-be-whole': () => '`gap` must be a whole number of rows, 0 or more',
  'compile.no-such-body-row': ({ row, rows }) =>
    `\`row\` is ${row}, but the body has rows 1 to ${rows}`,
  'compile.where-matches': ({ count }) =>
    `\`where\` matches ${count} rows of the data; it must find exactly one`,
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
  'compile.csv-has-no-header': () =>
    'レイアウトが読む CSV は先頭行にフィールド名が必要ですが、この CSV は空です',
  'compile.layout-has-no-columns': () => 'レイアウトには少なくとも 1 つの列が必要です',
  'compile.no-such-block': ({ name }) =>
    `\`${name}\` という名前のブロックは \`defs.blocks\` に宣言されていません`,
  'compile.column-named-twice': ({ name }) => `レイアウトに \`${name}\` という列が 2 つあります`,
  'compile.fields-names-no-input': ({ name }) =>
    `\`fields\` が指す \`${name}\` は、データが埋めるブロックの列ではありません`,
  'compile.csv-has-no-field': ({ field, column }) =>
    `CSV の見出し行に、列 \`${column}\` が読むフィールド \`${field}\` がありません`,
  'compile.row-too-long': ({ at, fields, inputs }) =>
    `${at} 行目のフィールドは ${fields} 個ですが、数式のない列は ${inputs} 個しかありません`,
  'compile.field-by-position': ({ column }) =>
    `列 \`${column}\` には \`field\` がありますが、この行は位置で対応付けられます`,
  'compile.field-with-no-file': ({ column }) =>
    `列 \`${column}\` には \`field\` がありますが、レイアウトは \`csv\` も \`json\` も読みません`,
  'compile.rows-fewer-than-data': ({ rows, data }) =>
    `\`rows\` は ${rows} ですが、データは ${data} 行あります`,
  'compile.layout-needs-rows': () =>
    'レイアウトには `rows`、または行数を数えるための `values`・`csv`・`json` が必要です',
  'compile.rows-must-be-whole': () => '`rows` は 1 以上の整数である必要があります',
  'compile.header-style-with-no-header': () =>
    'レイアウトに `header_style` がありますが、`header` を持つ列がありません',
  'compile.no-such-column': ({ name }) => `\`${name}\` はこのレイアウトの列ではありません`,
  'compile.unclosed-column-ref': () => '`{{` が `}}` で閉じられていません',
  'compile.text-spells-no-group': ({ name }) =>
    `文字列の中の \`{{${name}}}\` が表せるのは、外側の \`by\` グループの値だけです`,
  'compile.not-an-input-column': ({ name }) =>
    `\`${name}\` はデータが埋める列（\`formula\` のない列）である必要があります`,
  'compile.merges-leftward': ({ name, to }) => `\`${name}\` の結合先 \`${to}\` が右側にありません`,
  'compile.merges-over': ({ name, over }) =>
    `\`${name}\` の結合が、同じ行で書かれている \`${over}\` を覆っています`,
  'compile.group-inside-itself': ({ name }) =>
    `フッターのグループ \`${name}\` が自分自身の中に入れ子になっています`,
  'compile.group-needs-data': ({ name }) =>
    `フッターのグループ \`${name}\` はデータから値を取りますが、レイアウトはデータを読みません。\`order\` に列挙してください`,
  'compile.order-lists-twice': ({ value }) => `\`order\` に \`${value}\` が 2 回あります`,
  'compile.order-leaves-out': ({ value }) =>
    `\`order\` にデータ中の \`${value}\` がありません。その行はどの小計にも入らなくなります`,
  'compile.no-such-layout': ({ name }) => `\`${name}\` という名前のレイアウトはありません`,
  'compile.layout-on-another-sheet': ({ name, sheet }) =>
    `レイアウト \`${name}\` はこのシートではなく \`${sheet}\` にあります`,
  'compile.layout-not-yet': ({ name }) =>
    `レイアウト \`${name}\` は、それに続くレイアウトより後に宣言されています`,
  'compile.layout-named-twice': ({ name }) => `\`${name}\` は既に別のレイアウトの名前です`,
  'compile.gap-must-be-whole': () => '`gap` は 0 以上の整数の行数である必要があります',
  'compile.no-such-body-row': ({ row, rows }) =>
    `\`row\` は ${row} ですが、本体の行は 1 から ${rows} までです`,
  'compile.where-matches': ({ count }) =>
    `\`where\` がデータの ${count} 行に一致します。ちょうど 1 行である必要があります`,
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
