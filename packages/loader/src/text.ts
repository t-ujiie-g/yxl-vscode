import { type Book, type Nothing, type Saying, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'loader.an-entry': { key: string };
  'loader.named': { of: string; name: string };
  'loader.under': { what: Saying; key: string };
  'loader.a-run-of': { what: Saying; index: number };
  'loader.one-of': { what: Saying };

  'loader.needs': { what: Saying; key: string };
  'loader.must-be-a-mapping': { what: Saying };
  'loader.must-be-a-sequence': { what: Saying };
  'loader.must-be-text': { what: Saying };
  'loader.must-be-a-boolean': { what: Saying };
  'loader.must-be-a-number': { what: Saying };
  'loader.must-be-a-value': { what: Saying };
  'loader.at-must-be-text-or-a-number': { what: Saying };
  'loader.written-twice': { key: string };
  'loader.unknown-key': { key: string; what: Saying; expected: string };

  'loader.cell-needs-something': { what: Saying };
  'loader.rich-and-a-value': { what: Saying };
  'loader.type-with-no-value': { what: Saying };
  'loader.type-on-a-ref': { what: Saying; key: string };
  'loader.needs-a-run': { what: Saying };
  'loader.cannot-unset': { what: Saying };

  'loader.data-needs-a-source': { what: Saying };
  'loader.columns-needs-json': { what: Saying };
  'loader.rows-from-one-place': { key: string };
  'loader.field-must-be-a-value': { what: Saying; index: number };

  'loader.names-itself-twice': { what: Saying };
  'loader.needs-a-series': { what: Saying };
  'loader.needs-a-sparkline': { what: Saying };
  'loader.placed-twice': { what: Saying };

  'loader.link-two-targets': { what: Saying };
  'loader.link-needs-a-target': { what: Saying };
  'loader.asks-two-things': { what: Saying };
  'loader.needs-something-to-ask': { what: Saying };
  'loader.not-a-comparison': { what: Saying; kind: string };
  'loader.list-needs-choices': { what: Saying };

  'loader.scales-two-ways': { what: Saying };
  'loader.break-at-a1': { what: Saying };
  'loader.empty-name': { of: string };

  'loader.include-takes-no-sibling': Nothing;
  'loader.include-not-expanded': Nothing;
  'loader.include-needs-a-path': Nothing;
  'loader.include-unreadable': { path: string };
  'loader.include-cycle': { loop: string };
  'loader.include-empty': { file: string };
  'loader.is-not': { what: Saying; noun: Saying; text: string };
  'loader.one-of-these': { choices: string };
  'loader.a-cell-reference': Nothing;
  'loader.a-sheet-and-a-cell': Nothing;
  'loader.a-range': Nothing;
  'loader.a-column': Nothing;
  'loader.a-row': Nothing;
  'loader.a-hex-colour': Nothing;
  'loader.a-name': Nothing;
  'loader.a-style-name': Nothing;
  'loader.a-value-name': Nothing;
  'loader.a-formula-name': Nothing;
  'loader.a-path': Nothing;
  'loader.a-name-in': { what: Saying };
  'loader.unnamed-file': Nothing;
};

export const say = speaking<Says>();

/** The construct a message is about, named as one of a sheet's lists: `a \`charts\` entry`. */
export function entryOf(key: string) {
  return say('loader.an-entry', { key });
}

/** The same, named rather than counted: `cell \`A1\``. */
export function about(of: string, name: string) {
  return say('loader.named', { of, name });
}

/** One key under whatever a message was already about, which is how a path is said. */
export function under(what: Saying, key: string) {
  return say('loader.under', { what, key });
}

/** The construct a message names, in Japanese; English uses the schema's own word. */
const OF: Record<string, string> = {
  cell: 'セル',
  link: 'リンク',
  note: 'メモ',
  override: 'オーバーライド',
  sheet: 'シート',
};

/** English wants an article, and which one depends on the word after it. */
function article(key: string): string {
  return /^[aeiou]/.test(key) ? 'an' : 'a';
}

const en: Words<Says> = {
  'loader.an-entry': ({ key }) => `${article(key)} \`${key}\` entry`,
  'loader.named': ({ of, name }) => (name === '' ? of : `${of} \`${name}\``),
  'loader.under': ({ what, key }, worded) => `${worded(what)} \`${key}\``,
  'loader.a-run-of': ({ what, index }, worded) => `${worded(what)} run ${index}`,
  'loader.one-of': ({ what }, worded) => `a ${worded(what)} entry`,

  'loader.needs': ({ what, key }, worded) => `${worded(what)} needs ${article(key)} \`${key}\``,
  'loader.must-be-a-mapping': ({ what }, worded) => `${worded(what)} must be a mapping`,
  'loader.must-be-a-sequence': ({ what }, worded) => `${worded(what)} must be a sequence`,
  'loader.must-be-text': ({ what }, worded) => `${worded(what)} must be text`,
  'loader.must-be-a-boolean': ({ what }, worded) => `${worded(what)} must be true or false`,
  'loader.must-be-a-number': ({ what }, worded) => `${worded(what)} must be a number`,
  'loader.must-be-a-value': ({ what }, worded) =>
    `${worded(what)} must be text, a number, or a boolean`,
  'loader.at-must-be-text-or-a-number': ({ what }, worded) =>
    `${worded(what)} \`at\` must be text or a number`,
  'loader.written-twice': ({ key }) => `\`${key}\` is written twice; the first one wins`,
  'loader.unknown-key': ({ key, what, expected }, worded) =>
    `unknown key \`${key}\` in ${worded(what)} (expected ${expected})`,

  'loader.cell-needs-something': ({ what }, worded) =>
    `${worded(what)} needs a \`value\`, a \`formula\`, or a \`style\``,
  'loader.rich-and-a-value': ({ what }, worded) =>
    `${worded(what)} cannot be \`rich\` and hold a value too`,
  'loader.type-with-no-value': ({ what }, worded) =>
    `${worded(what)} has a \`type\` with no value to apply it to`,
  'loader.type-on-a-ref': ({ what, key }, worded) =>
    `${worded(what)} cannot give a \`type\` to a \`${key}\``,
  'loader.needs-a-run': ({ what }, worded) => `${worded(what)} needs at least one run`,
  'loader.cannot-unset': ({ what }, worded) => `${worded(what)} cannot take an attribute away`,

  'loader.data-needs-a-source': ({ what }, worded) =>
    `${worded(what)} needs \`values\`, \`csv\`, or \`json\``,
  'loader.columns-needs-json': ({ what }, worded) =>
    `${worded(what)} names \`columns\`, which only an array of JSON objects has`,
  'loader.rows-from-one-place': ({ key }) =>
    `a \`data\` entry takes its rows from one place; \`${key}\` is a second`,
  'loader.field-must-be-a-value': ({ what, index }, worded) =>
    `field ${index} of ${worded(what)} must be text, a number, a boolean, or null`,

  'loader.names-itself-twice': ({ what }, worded) =>
    `${worded(what)} names itself twice: \`name\` and \`name_from\``,
  'loader.needs-a-series': ({ what }, worded) => `${worded(what)} needs at least one series`,
  'loader.needs-a-sparkline': ({ what }, worded) => `${worded(what)} needs a sparkline to place`,
  'loader.placed-twice': ({ what }, worded) =>
    `${worded(what)} is placed twice: \`at\` and \`cells\``,

  'loader.link-two-targets': ({ what }, worded) =>
    `${worded(what)} cannot go to a \`url\` and a \`to\``,
  'loader.link-needs-a-target': ({ what }, worded) => `${worded(what)} needs a \`url\` or a \`to\``,
  'loader.asks-two-things': ({ what }, worded) => `${worded(what)} asks two things at once`,
  'loader.needs-something-to-ask': ({ what }, worded) => `${worded(what)} needs something to ask`,
  'loader.not-a-comparison': ({ what, kind }, worded) =>
    `${worded(what)} \`${kind}\` is not a comparison`,
  'loader.list-needs-choices': ({ what }, worded) =>
    `${worded(what)} \`list\` needs choices or a \`from\``,

  'loader.scales-two-ways': ({ what }, worded) =>
    `${worded(what)} scales two ways at once: \`scale\` and \`fit\``,
  'loader.break-at-a1': ({ what }, worded) => `${worded(what)} at \`A1\` breaks nothing`,
  'loader.empty-name': ({ of }) => `a ${of} name cannot be empty`,

  'loader.include-takes-no-sibling': () =>
    'an `$include` replaces its whole node, so it takes no other key',
  'loader.include-not-expanded': () => 'an `$include` is not expanded here',
  'loader.include-needs-a-path': () => 'an `$include` needs a path',
  'loader.include-unreadable': ({ path }) => `cannot read \`${path}\``,
  'loader.include-cycle': ({ loop }) => `an \`$include\` comes back round: ${loop}`,
  'loader.include-empty': ({ file }) => `\`${file}\` holds nothing to include`,
  'loader.is-not': ({ what, noun, text }, worded) =>
    `${worded(what)} is not ${worded(noun)}: \`${text}\``,
  'loader.one-of-these': ({ choices }) => `one of ${choices}`,
  'loader.a-cell-reference': () => 'a cell reference',
  'loader.a-sheet-and-a-cell': () => 'a sheet and a cell',
  'loader.a-range': () => 'a range',
  'loader.a-column': () => 'a column or a range of columns',
  'loader.a-row': () => 'a row or a range of rows',
  'loader.a-hex-colour': () => 'a hex colour',
  'loader.a-name': () => 'a name',
  'loader.a-style-name': () => 'a style name',
  'loader.a-value-name': () => 'a value name',
  'loader.a-formula-name': () => 'a formula name',
  'loader.a-path': () => 'a path',
  'loader.a-name-in': ({ what }, worded) => `a name in ${worded(what)}`,
  'loader.unnamed-file': () => 'a spec is read from a named file',
};

const ja: Words<Says> = {
  'loader.an-entry': ({ key }) => `\`${key}\` のエントリ`,
  'loader.named': ({ of, name }) => (name === '' ? (OF[of] ?? of) : `${OF[of] ?? of} \`${name}\``),
  'loader.under': ({ what, key }, worded) => `${worded(what)}の \`${key}\``,
  'loader.a-run-of': ({ what, index }, worded) => `${worded(what)}の ${index} 番目の部分`,
  'loader.one-of': ({ what }, worded) => `${worded(what)}のエントリ`,

  'loader.needs': ({ what, key }, worded) => `${worded(what)}には \`${key}\` が必要です`,
  'loader.must-be-a-mapping': ({ what }, worded) =>
    `${worded(what)}はマッピングである必要があります`,
  'loader.must-be-a-sequence': ({ what }, worded) =>
    `${worded(what)}はシーケンスである必要があります`,
  'loader.must-be-text': ({ what }, worded) => `${worded(what)}は文字列である必要があります`,
  'loader.must-be-a-boolean': ({ what }, worded) => `${worded(what)}は true か false です`,
  'loader.must-be-a-number': ({ what }, worded) => `${worded(what)}は数値である必要があります`,
  'loader.must-be-a-value': ({ what }, worded) =>
    `${worded(what)}は文字列・数値・真偽値のいずれかである必要があります`,
  'loader.at-must-be-text-or-a-number': ({ what }, worded) =>
    `${worded(what)}の \`at\` は文字列か数値である必要があります`,
  'loader.written-twice': ({ key }) => `\`${key}\` が 2 回書かれています。最初のものが使われます`,
  'loader.unknown-key': ({ key, what, expected }, worded) =>
    `${worded(what)}に未知のキー \`${key}\` があります（使えるのは ${expected}）`,

  'loader.cell-needs-something': ({ what }, worded) =>
    `${worded(what)}には \`value\`、\`formula\`、\`style\` のいずれかが必要です`,
  'loader.rich-and-a-value': ({ what }, worded) =>
    `${worded(what)}は \`rich\` と値の両方を持てません`,
  'loader.type-with-no-value': ({ what }, worded) =>
    `${worded(what)}には \`type\` がありますが、適用する値がありません`,
  'loader.type-on-a-ref': ({ what, key }, worded) =>
    `${worded(what)}は \`${key}\` に \`type\` を与えられません`,
  'loader.needs-a-run': ({ what }, worded) => `${worded(what)}には少なくとも 1 つの部分が必要です`,
  'loader.cannot-unset': ({ what }, worded) => `${worded(what)}では属性を取り消せません`,

  'loader.data-needs-a-source': ({ what }, worded) =>
    `${worded(what)}には \`values\`、\`csv\`、\`json\` のいずれかが必要です`,
  'loader.columns-needs-json': ({ what }, worded) =>
    `${worded(what)}は \`columns\` を指定していますが、これは JSON オブジェクトの配列にしかありません`,
  'loader.rows-from-one-place': ({ key }) =>
    `\`data\` のエントリが行を取る場所は 1 つです。\`${key}\` は 2 つ目です`,
  'loader.field-must-be-a-value': ({ what, index }, worded) =>
    `${worded(what)}の ${index} 番目のフィールドは、文字列・数値・真偽値・null のいずれかである必要があります`,

  'loader.names-itself-twice': ({ what }, worded) =>
    `${worded(what)}は \`name\` と \`name_from\` の 2 通りで自分を名指ししています`,
  'loader.needs-a-series': ({ what }, worded) =>
    `${worded(what)}には少なくとも 1 つの系列が必要です`,
  'loader.needs-a-sparkline': ({ what }, worded) =>
    `${worded(what)}には配置するスパークラインが必要です`,
  'loader.placed-twice': ({ what }, worded) =>
    `${worded(what)}は \`at\` と \`cells\` の 2 通りで配置されています`,

  'loader.link-two-targets': ({ what }, worded) =>
    `${worded(what)}は \`url\` と \`to\` の両方へは行けません`,
  'loader.link-needs-a-target': ({ what }, worded) =>
    `${worded(what)}には \`url\` か \`to\` が必要です`,
  'loader.asks-two-things': ({ what }, worded) =>
    `${worded(what)}は一度に 2 つのことを尋ねています`,
  'loader.needs-something-to-ask': ({ what }, worded) => `${worded(what)}には尋ねる内容が必要です`,
  'loader.not-a-comparison': ({ what, kind }, worded) =>
    `${worded(what)}の \`${kind}\` は比較ではありません`,
  'loader.list-needs-choices': ({ what }, worded) =>
    `${worded(what)}の \`list\` には選択肢か \`from\` が必要です`,

  'loader.scales-two-ways': ({ what }, worded) =>
    `${worded(what)}は \`scale\` と \`fit\` の 2 通りで拡大率を決めています`,
  'loader.break-at-a1': ({ what }, worded) => `${worded(what)}の \`A1\` は何も改ページしません`,
  'loader.empty-name': ({ of }) => `${of}の名前は空にできません`,

  'loader.include-takes-no-sibling': () =>
    '`$include` はノード全体を置き換えるため、ほかのキーを持てません',
  'loader.include-not-expanded': () => 'ここでは `$include` は展開されません',
  'loader.include-needs-a-path': () => '`$include` にはパスが必要です',
  'loader.include-unreadable': ({ path }) => `\`${path}\` を読めません`,
  'loader.include-cycle': ({ loop }) => `\`$include\` が循環しています: ${loop}`,
  'loader.include-empty': ({ file }) => `\`${file}\` には include するものがありません`,
  'loader.is-not': ({ what, noun, text }, worded) =>
    `${worded(what)}は${worded(noun)}ではありません: \`${text}\``,
  'loader.one-of-these': ({ choices }) => `${choices} のいずれか`,
  'loader.a-cell-reference': () => 'セル参照',
  'loader.a-sheet-and-a-cell': () => 'シートとセルの組',
  'loader.a-range': () => '範囲',
  'loader.a-column': () => '列または列の範囲',
  'loader.a-row': () => '行または行の範囲',
  'loader.a-hex-colour': () => '16 進の色',
  'loader.a-name': () => '名前',
  'loader.a-style-name': () => 'スタイル名',
  'loader.a-value-name': () => '値の名前',
  'loader.a-formula-name': () => '数式の名前',
  'loader.a-path': () => 'パス',
  'loader.a-name-in': ({ what }, worded) => `${worded(what)}の中の名前`,
  'loader.unnamed-file': () => 'spec は名前のあるファイルから読みます',
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
