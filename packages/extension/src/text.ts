import {
  type Book,
  type Language,
  type Nothing,
  type Saying,
  speaking,
  type Words,
} from '@yxl-vscode/diag';
import { columnLabel } from '@yxl-vscode/units';

/** The run of rows or columns a gesture named, which each language says in its own way. */
type Run = { axis: string; first: number; last: number };

/** That run, as a sentence in one language names it. */
function spanned({ axis, first, last }: Run, language: Language): string {
  const at = (of: number) => (axis === 'column' ? columnLabel(of) : String(of));
  if (language === 'ja') {
    const unit = axis === 'column' ? '列' : '行';
    return first === last ? `${at(first)} ${unit}` : `${at(first)}〜${at(last)} ${unit}`;
  }

  const word = axis === 'column' ? 'column' : 'row';
  return first === last ? `${word} ${at(first)}` : `${word}s ${at(first)}-${at(last)}`;
}

/** Every sentence the host says for itself, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'host.no-chart-here': Nothing;
  'host.chart-is-a-shape': Nothing;
  'host.chart-done': { what: Saying };
  'host.nothing-to-fill': { axis: string };
  'host.one-range-or-each': Nothing;
  'host.fill-done': { what: Saying };
  'host.cannot-hide': Run;
  'host.nothing-hides': Run;
  'host.band-over-more': Run;
  'host.hidden-done': Run;
  'host.shown-done': Run;
  'host.nothing-groups': Run;
  'host.cannot-group': Run;
  'host.grouped-done': Run;
  'host.ungrouped-done': Run;
  'host.nothing-moves': Run;
  'host.moves-a-lot': { what: Saying; keys: number };
  'host.lines-taken-away': Run;
  'host.lines-put-in': Run;
  'host.no-look-here': Nothing;
  'host.look-is-an-exception': Nothing;
  'host.look-from-different-places': Nothing;
  'host.look-is-shared': { many: number };
  'host.restyled': { many: number };
  'host.no-width-here': Run;
  'host.size-from-a-band': Run;
  'host.resized': Run;
  'host.answer-is-gone': Nothing;
  'host.not-a-sheet-name': { name: string };
  'host.cells-changed': { what: Saying; many: number };
  'host.empty-the-ones': Nothing;
  'host.paste-the-ones': Nothing;
  'host.replace-the-ones': Nothing;
  'host.and-the-rest': { what: Saying; doing: string };
  'host.cells-emptied': { many: number };
  'host.cells-pasted': { many: number };
  'host.cells-moved': { many: number };
  'host.cells-replaced': { many: number };
  'host.now-an-override': { at: string };
  'host.floats-from': { at: string };
  'host.takes-size': { width: number; height: number };
  'host.image-floats': { path: string; at: string };
  'host.opened': { url: string };
  'host.went-to': { at: string };
  'host.run-now-reads': { index: number; at: string; text: string };
  'host.sheet-added': { name: string };
  'host.sheet-renamed': { was: string; name: string };
  'host.sheet-taken-out': { name: string };
  'host.sheet-moved': { name: string };
  'host.sheet-set': { name: string };
  'host.rows-in-order': { many: number };
  'host.rows-one-table': { many: number };
  'host.still-loading': Nothing;
  'host.nothing-on-clipboard': Nothing;
  'host.spec-is-ok': { file: string };
  'host.built': { file: string };
  'host.open-it': Nothing;
  'host.create': Nothing;
  'host.a-yxl-spec': Nothing;
  'host.no-compiler': { binary: string };
  'host.how-to-install': Nothing;
  'host.refused-the-spec': Nothing;
  'host.open-a-spec-first': Nothing;
  'host.nothing-to-tidy': Nothing;
  'host.name-the-look': Nothing;
  'host.name-is-taken': { name: string };
  'host.not-a-name': Nothing;
  'host.tidy-refused': { why: string };
  'host.apply-the-tidy-up': { what: Saying };
  'host.apply': Nothing;
  'host.tidied': { name: string; sites: number };
  'host.no-init': { found: string; since: string };
  'host.version-unknown': Nothing;
  'host.older-compiler': { found: string; target: string };
  'host.newer-compiler': { found: string; target: string };
  'host.file-unreadable': { file: string };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'host.no-chart-here': () =>
    'a chart plots a column against the labels beside it, and this is one column',
  'host.chart-is-a-shape': () =>
    'a chart is a shape as well as a range, and the shape is not in the selection — a stacked one is the same entry with the word changed',
  'host.chart-done': ({ what }, worded) => `${worded(what)} is over the cells you selected.`,
  'host.nothing-to-fill': ({ axis }) =>
    `nothing on the first ${axis === 'row' ? 'row' : 'column'} of this is written, so there is nothing to fill`,
  'host.one-range-or-each': () =>
    'a spec can hold this as one range or as a cell each, so it is worth saying which',
  'host.fill-done': ({ what }, worded) => `${worded(what).replace(/^W/, 'w')}: done.`,
  'host.cannot-hide': (run) => `nothing here can hide ${spanned(run, 'en')}`,
  'host.nothing-hides': (run) => `nothing hides ${spanned(run, 'en')}`,
  'host.band-over-more': (run) =>
    `${spanned(run, 'en')} take that from a band over more than them, so there is more than one way to change it`,
  'host.hidden-done': (run) => `${spanned(run, 'en')} hidden.`,
  'host.shown-done': (run) => `${spanned(run, 'en')} shown again.`,
  'host.nothing-groups': (run) => `nothing groups ${spanned(run, 'en')}`,
  'host.cannot-group': (run) => `nothing here can group ${spanned(run, 'en')}`,
  'host.grouped-done': (run) => `${spanned(run, 'en')} grouped.`,
  'host.ungrouped-done': (run) => `${spanned(run, 'en')} taken out of the outline.`,
  'host.nothing-moves': (run) => `nothing here moves when ${spanned(run, 'en')} is drawn`,
  'host.moves-a-lot': ({ what, keys }, worded) =>
    `this moves more than a handful of things, so it is worth seeing first: ${worded(what)}${
      keys > 0 ? ' — a `data:` table keeps its addresses in one place, and moves in one line' : ''
    }`,
  'host.lines-taken-away': (run) => `${spanned(run, 'en')} taken away.`,
  'host.lines-put-in': (run) => `${spanned(run, 'en')} put in.`,
  'host.no-look-here': () => 'nothing here can carry that look',
  'host.look-is-an-exception': () =>
    'a formula range fills this cell, so a look on it is either an exception or the whole run',
  'host.look-from-different-places': () =>
    'the cells here take that look from different places, so there is more than one way to change it',
  'host.look-is-shared': ({ many }) =>
    `this look comes from something ${many} cell${many === 1 ? '' : 's'} read, so there is more than one way to change it`,
  'host.restyled': ({ many }) => `${many} cell${many === 1 ? '' : 's'} restyled.`,
  'host.no-width-here': (run) => `nothing here can say how wide ${spanned(run, 'en')} is`,
  'host.size-from-a-band': (run) =>
    `${spanned(run, 'en')} takes its size from a band over more than that, so there is more than one way to change it`,
  'host.resized': (run) =>
    `${spanned(run, 'en')} resized.`.replace(/^./, (one) => one.toUpperCase()),
  'host.answer-is-gone': () => 'that answer is no longer one of the ways this edit could be made',
  'host.not-a-sheet-name': ({ name }) => `\`${name}\` is not a name a sheet can have`,
  'host.cells-changed': ({ what, many }, worded) =>
    `${worded(what).replace(/^C/, 'c')}: ${many} cells changed.`,
  'host.empty-the-ones': () => 'Empty the ones that can be',
  'host.paste-the-ones': () => 'Paste into the ones that can take it',
  'host.replace-the-ones': () => 'Replace the ones that can be',
  'host.and-the-rest': ({ what, doing }, worded) => `${worded(what)}, and ${doing} the rest`,
  'host.cells-emptied': ({ many }) => `${many} cell${many === 1 ? '' : 's'} emptied.`,
  'host.cells-pasted': ({ many }) => `${many} cell${many === 1 ? '' : 's'} pasted.`,
  'host.cells-moved': ({ many }) => `${many} cell${many === 1 ? '' : 's'} moved.`,
  'host.cells-replaced': ({ many }) => `${many} cell${many === 1 ? '' : 's'} replaced.`,
  'host.now-an-override': ({ at }) => `${at} is now written as an override.`,
  'host.floats-from': ({ at }) => `It floats from ${at} now.`,
  'host.takes-size': ({ width, height }) => `It takes ${width} by ${height} now.`,
  'host.image-floats': ({ path, at }) => `\`${path}\` floats from ${at}.`,
  'host.opened': ({ url }) => `Opened ${url}.`,
  'host.went-to': ({ at }) => `Went to ${at}.`,
  'host.run-now-reads': ({ index, at, text }) => `Run ${index} of ${at} now reads ${text}.`,
  'host.sheet-added': ({ name }) => `\`${name}\` added.`,
  'host.sheet-renamed': ({ was, name }) => `\`${was}\` is \`${name}\` now.`,
  'host.sheet-taken-out': ({ name }) => `\`${name}\` taken out.`,
  'host.sheet-moved': ({ name }) => `\`${name}\` moved.`,
  'host.sheet-set': ({ name }) => `\`${name}\` set.`,
  'host.rows-in-order': ({ many }) => `${many} rows in order.`,
  'host.rows-one-table': ({ many }) => `${many} rows are one table now.`,
  'host.still-loading': () => 'this spec has not finished loading',
  'host.nothing-on-clipboard': () => 'there is nothing on the clipboard to put down',
  'host.spec-is-ok': ({ file }) => `${file}: ok`,
  'host.built': ({ file }) => `Built ${file}`,
  'host.open-it': () => 'Open it',
  'host.create': () => 'Create',
  'host.a-yxl-spec': () => 'yxl spec',
  'host.no-compiler': ({ binary }) =>
    `Could not run \`${binary}\`. Install yxl, or set \`yxl.path\` to it.`,
  'host.how-to-install': () => 'How to install',
  'host.refused-the-spec': () => 'yxl refused the spec.',
  'host.open-a-spec-first': () => 'Open a `*.yxl.yaml` spec first.',
  'host.nothing-to-tidy': () => 'Nothing here is written out often enough to be worth gathering.',
  'host.name-the-look': () => 'A name for this look, as `defs.styles` will hold it',
  'host.name-is-taken': ({ name }) => `\`${name}\` already names a look here`,
  'host.not-a-name': () => 'a look needs a name',
  'host.tidy-refused': ({ why }) => `This would change the workbook, so it was not made: ${why}`,
  'host.apply-the-tidy-up': ({ what }, worded) => `${worded(what)}. Apply it?`,
  'host.apply': () => 'Apply',
  'host.tidied': ({ name, sites }) => `Gathered ${sites} places into \`${name}\`.`,
  'host.no-init': ({ found, since }) => `yxl ${found} has no \`init\`; it arrived in ${since}.`,
  'host.version-unknown': () => '`yxl version` did not say which version it is.',
  'host.older-compiler': ({ found, target }) =>
    `yxl ${found} is older than the ${target} this preview targets: a construct it understands may not exist there.`,
  'host.newer-compiler': ({ found, target }) =>
    `yxl ${found} is newer than the ${target} this preview targets: what it writes still builds, but the schema may have moved.`,
  'host.file-unreadable': ({ file }) => `${file} could not be read`,
};

const ja: Words<Says> = {
  'host.no-chart-here': () =>
    'グラフは 1 列をその隣のラベルに対して描きますが、ここは 1 列だけです',
  'host.chart-is-a-shape': () =>
    'グラフは範囲であると同時に図形でもあり、その図形は選択範囲に含まれていません。積み上げにするには、同じエントリの語を変えます',
  'host.chart-done': ({ what }, worded) => `${worded(what)}を選択したセルの上に置きました。`,
  'host.nothing-to-fill': ({ axis }) =>
    `この範囲の最初の${axis === 'row' ? '行' : '列'}には何も書かれていないため、埋めるものがありません`,
  'host.one-range-or-each': () =>
    'spec はこれを 1 つの範囲としても、セルごとにも持てます。どちらにするか決めてください',
  'host.fill-done': ({ what }, worded) => `${worded(what)}: 完了しました。`,
  'host.cannot-hide': (run) => `ここでは${spanned(run, 'ja')}を非表示にできません`,
  'host.nothing-hides': (run) => `${spanned(run, 'ja')}を非表示にしているものはありません`,
  'host.band-over-more': (run) =>
    `${spanned(run, 'ja')}はより広い帯からその指定を受け取っているため、変更する方法が複数あります`,
  'host.hidden-done': (run) => `${spanned(run, 'ja')}を非表示にしました。`,
  'host.shown-done': (run) => `${spanned(run, 'ja')}を再表示しました。`,
  'host.nothing-groups': (run) => `${spanned(run, 'ja')}をグループ化しているものはありません`,
  'host.cannot-group': (run) => `ここでは${spanned(run, 'ja')}をグループ化できません`,
  'host.grouped-done': (run) => `${spanned(run, 'ja')}をグループ化しました。`,
  'host.ungrouped-done': (run) => `${spanned(run, 'ja')}をアウトラインから外しました。`,
  'host.nothing-moves': (run) => `${spanned(run, 'ja')}を引いても、ここでは何も動きません`,
  'host.moves-a-lot': ({ what, keys }, worded) =>
    `これは多くの箇所を動かすので、先に確認する価値があります: ${worded(what)}${
      keys > 0 ? ' — `data:` テーブルは住所を 1 か所にまとめており、1 行で動きます' : ''
    }`,
  'host.lines-taken-away': (run) => `${spanned(run, 'ja')}を削除しました。`,
  'host.lines-put-in': (run) => `${spanned(run, 'ja')}を挿入しました。`,
  'host.no-look-here': () => 'ここにはその書式を持たせられません',
  'host.look-is-an-exception': () =>
    'このセルは数式の範囲が埋めているため、書式は例外にするか、範囲全体に付けるかのどちらかです',
  'host.look-from-different-places': () =>
    'ここのセルはそれぞれ別の場所から書式を受け取っているため、変更する方法が複数あります',
  'host.look-is-shared': ({ many }) =>
    `この書式は ${many} セルが読んでいるものから来ているため、変更する方法が複数あります`,
  'host.restyled': ({ many }) => `${many} セルの書式を変えました。`,
  'host.no-width-here': (run) => `ここでは${spanned(run, 'ja')}の幅を指定できません`,
  'host.size-from-a-band': (run) =>
    `${spanned(run, 'ja')}はより広い帯からサイズを受け取っているため、変更する方法が複数あります`,
  'host.resized': (run) => `${spanned(run, 'ja')}のサイズを変えました。`,
  'host.answer-is-gone': () => 'その答えは、この編集を行う方法ではなくなりました',
  'host.not-a-sheet-name': ({ name }) => `\`${name}\` はシート名として使えません`,
  'host.cells-changed': ({ what, many }, worded) => `${worded(what)}: ${many} セルを変更しました。`,
  'host.empty-the-ones': () => '空にできるものだけ空にする',
  'host.paste-the-ones': () => '受け取れるセルにだけ貼り付ける',
  'host.replace-the-ones': () => '置換できるものだけ置換する',
  'host.and-the-rest': ({ what, doing }, worded) =>
    `${worded(what)}、残りは${doing === 'paste' ? '貼り付ける' : '書き込む'}`,
  'host.cells-emptied': ({ many }) => `${many} セルを空にしました。`,
  'host.cells-pasted': ({ many }) => `${many} セルを貼り付けました。`,
  'host.cells-moved': ({ many }) => `${many} セルを移動しました。`,
  'host.cells-replaced': ({ many }) => `${many} セルを置換しました。`,
  'host.now-an-override': ({ at }) => `${at} をオーバーライドとして書きました。`,
  'host.floats-from': ({ at }) => `${at} から浮くようになりました。`,
  'host.takes-size': ({ width, height }) => `大きさを ${width} × ${height} にしました。`,
  'host.image-floats': ({ path, at }) => `\`${path}\` が ${at} から浮いています。`,
  'host.opened': ({ url }) => `${url} を開きました。`,
  'host.went-to': ({ at }) => `${at} へ移動しました。`,
  'host.run-now-reads': ({ index, at, text }) =>
    `${at} の ${index} 番目の部分を ${text} にしました。`,
  'host.sheet-added': ({ name }) => `\`${name}\` を追加しました。`,
  'host.sheet-renamed': ({ was, name }) => `\`${was}\` を \`${name}\` にしました。`,
  'host.sheet-taken-out': ({ name }) => `\`${name}\` を取り出しました。`,
  'host.sheet-moved': ({ name }) => `\`${name}\` を移動しました。`,
  'host.sheet-set': ({ name }) => `\`${name}\` を設定しました。`,
  'host.rows-in-order': ({ many }) => `${many} 行を並べ替えました。`,
  'host.rows-one-table': ({ many }) => `${many} 行を 1 つのテーブルにしました。`,
  'host.still-loading': () => 'この spec はまだ読み込み中です',
  'host.nothing-on-clipboard': () => 'クリップボードに貼り付けるものがありません',
  'host.spec-is-ok': ({ file }) => `${file}: 問題ありません`,
  'host.built': ({ file }) => `${file} をビルドしました`,
  'host.open-it': () => '開く',
  'host.create': () => '作成',
  'host.a-yxl-spec': () => 'yxl スペック',
  'host.no-compiler': ({ binary }) =>
    `\`${binary}\` を実行できませんでした。yxl をインストールするか、\`yxl.path\` に指定してください。`,
  'host.how-to-install': () => 'インストール方法',
  'host.refused-the-spec': () => 'yxl がこの spec を受け付けませんでした。',
  'host.open-a-spec-first': () => 'まず `*.yxl.yaml` の spec を開いてください。',
  'host.nothing-to-tidy': () => 'まとめる価値があるほど繰り返し書かれている見た目はありません。',
  'host.name-the-look': () => 'この見た目に付ける名前（`defs.styles` に入ります）',
  'host.name-is-taken': ({ name }) => `\`${name}\` はすでに別の見た目の名前です`,
  'host.not-a-name': () => '名前が必要です',
  'host.tidy-refused': ({ why }) => `ワークブックが変わってしまうため、実行しませんでした: ${why}`,
  'host.apply-the-tidy-up': ({ what }, worded) => `${worded(what)}。適用しますか？`,
  'host.apply': () => '適用',
  'host.tidied': ({ name, sites }) => `${sites} 箇所を \`${name}\` にまとめました。`,
  'host.no-init': ({ found, since }) =>
    `yxl ${found} には \`init\` がありません（${since} からの機能です）。`,
  'host.version-unknown': () => '`yxl version` がバージョンを答えませんでした。',
  'host.older-compiler': ({ found, target }) =>
    `yxl ${found} はこのプレビューが対象とする ${target} より古いバージョンです。ここで扱える構文が、そちらには無いかもしれません。`,
  'host.newer-compiler': ({ found, target }) =>
    `yxl ${found} はこのプレビューが対象とする ${target} より新しいバージョンです。書いたものはビルドできますが、スキーマが動いている可能性があります。`,
  'host.file-unreadable': ({ file }) => `${file} を読めませんでした`,
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
