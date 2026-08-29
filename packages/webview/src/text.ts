import { type Book, type Nothing, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence the panel says for itself, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'view.span-one': { axis: string; at: string };
  'view.span-many': { axis: string; from: string; to: string };

  'view.freeze-panes': Nothing;
  'view.freeze-up-to': { at: string };
  'view.the-selected-cell': Nothing;
  'view.no-frozen-panes': Nothing;
  'view.bold': Nothing;
  'view.italic': Nothing;
  'view.underline': Nothing;
  'view.strikethrough': Nothing;
  'view.wrap-text': Nothing;
  'view.text-colour': Nothing;
  'view.automatic-text-colour': Nothing;
  'view.fill': Nothing;
  'view.no-fill': Nothing;
  'view.align-left': Nothing;
  'view.align-centre': Nothing;
  'view.align-right': Nothing;
  'view.align-top': Nothing;
  'view.align-middle': Nothing;
  'view.align-bottom': Nothing;
  'view.all-borders': Nothing;
  'view.top-border': Nothing;
  'view.bottom-border': Nothing;
  'view.left-border': Nothing;
  'view.right-border': Nothing;
  'view.no-borders': Nothing;
  'view.borders': Nothing;
  'view.border-line': Nothing;

  'view.number-format': Nothing;
  'view.number-format-now': { code: string };
  'view.general': Nothing;
  'view.format-as-percent': Nothing;
  'view.fewer-decimals': Nothing;
  'view.more-decimals': Nothing;
  'view.clear-formatting': Nothing;
  'view.default-font': Nothing;
  'view.font': Nothing;
  'view.font-size': Nothing;
  'view.custom-colour': Nothing;

  'view.select-whole-sheet': Nothing;
  'view.go-to-an-address': Nothing;
  'view.what-this-cell-holds': Nothing;
  'view.what-this-run-says': Nothing;
  'view.which-run-to-edit': Nothing;
  'view.find-in-this-sheet': Nothing;
  'view.close-the-search': Nothing;
  'view.close-the-search-key': Nothing;
  'view.replace-with': Nothing;
  'view.replace': Nothing;
  'view.go-to-one-first': Nothing;
  'view.replace-the-one': Nothing;
  'view.replace-all': Nothing;
  'view.which-of-them': { at: number; of: number };
  'view.nothing-holds-that': Nothing;

  'view.parameters': Nothing;
  'view.parameters-set': { set: number };
  'view.count': { held: string };
  'view.sum': { sum: string };
  'view.average': { average: string };
  'view.too-many-formulas': { limit: number };
  'view.not-computed': { names: string };
  'view.and-more': { rest: number };
  'view.leave-it-as-it-is': Nothing;
  'view.write-as-override': Nothing;
  'view.locked-external': Nothing;
  'view.locked-mediated': Nothing;
  'view.locked-rich': Nothing;
  'view.reaches-nothing': { what: string };
  'view.reaches-cells': { what: string; count: number };
  'view.nothing-selected': Nothing;
  'view.nothing-writes-this-cell': Nothing;
  'view.also-holds-undrawn': Nothing;
  'view.rename-or-reorder': Nothing;
  'view.hidden-in-excel': { visibility: string };
  'view.add-a-sheet': Nothing;
  'view.no-sheets-to-draw': Nothing;
  'view.split-where': { where: string };

  'view.sort-a-to-z': Nothing;
  'view.sort-z-to-a': Nothing;
  'view.fill-down': Nothing;
  'view.fill-right': Nothing;
  'view.make-a-data-table': Nothing;
  'view.unmerge-cells': Nothing;
  'view.merge-cells': Nothing;
  'view.clear-contents': Nothing;
  'view.delete': Nothing;
  'view.create-a-filter': Nothing;
  'view.remove-filter': Nothing;
  'view.insert-a-chart': Nothing;
  'view.insert-an-image': Nothing;
  'view.insert-note': Nothing;
  'view.edit-note': Nothing;
  'view.delete-note': Nothing;
  'view.link-to-a-page': Nothing;
  'view.link-to-a-cell': Nothing;
  'view.edit-link': Nothing;
  'view.remove-link': Nothing;
  'view.data-validation': Nothing;
  'view.remove-validation': Nothing;
  'view.remove-table': Nothing;
  'view.format-as-table': Nothing;
  'view.paste': Nothing;
  'view.paste-is-the-keyboards': { chord: string };
  'view.insert-before': { many: number; axis: string };
  'view.insert-after': { many: number; axis: string };
  'view.delete-bands': { many: number; axis: string };
  'view.hide-bands': { many: number; axis: string };
  'view.show-again': { span: string };
  'view.group-bands': { many: number; axis: string };
  'view.take-out-of-the-outline': Nothing;
  'view.open-run': { span: string };
  'view.collapse-run': { span: string };
  'view.rename': Nothing;
  'view.hide': Nothing;
  'view.unhide': Nothing;
  'view.gridlines': Nothing;
  'view.tab-colour': Nothing;
  'view.no-tab-colour': Nothing;

  'view.unlocked-cell': Nothing;
  'view.written-as-an-override': Nothing;
  'view.cannot-be-typed-into': { why: string };
  'view.standing-rich': Nothing;
  'view.standing-external': Nothing;
  'view.standing-mediated': Nothing;
  'view.heads-a-table': Nothing;
  'view.heads-the-table': { name: string };
  'view.column-is-filtered': Nothing;
  'view.a-note': Nothing;
  'view.a-list': Nothing;
  'view.a-chart': { type: string };
  'view.chart-over': { name: string; values: string; categories: string };
  'view.chart-axis': { which: string; title: string; ends: string };
  'view.chart-from': { min: number };
  'view.chart-to': { max: number };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'view.span-one': ({ axis, at }) => `${axis === 'column' ? 'column' : 'row'} ${at}`,
  'view.span-many': ({ axis, from, to }) =>
    `${axis === 'column' ? 'columns' : 'rows'} ${from}-${to}`,

  'view.freeze-panes': () => 'Freeze panes',
  'view.freeze-up-to': ({ at }) => `Freeze up to ${at}`,
  'view.the-selected-cell': () => 'the selected cell',
  'view.no-frozen-panes': () => 'No frozen panes',
  'view.bold': () => 'Bold',
  'view.italic': () => 'Italic',
  'view.underline': () => 'Underline',
  'view.strikethrough': () => 'Strikethrough',
  'view.wrap-text': () => 'Wrap text',
  'view.text-colour': () => 'Text colour',
  'view.automatic-text-colour': () => 'Automatic text colour',
  'view.fill': () => 'Fill',
  'view.no-fill': () => 'No fill',
  'view.align-left': () => 'Align left',
  'view.align-centre': () => 'Align centre',
  'view.align-right': () => 'Align right',
  'view.align-top': () => 'Align top',
  'view.align-middle': () => 'Align middle',
  'view.align-bottom': () => 'Align bottom',
  'view.all-borders': () => 'All borders',
  'view.top-border': () => 'Top border',
  'view.bottom-border': () => 'Bottom border',
  'view.left-border': () => 'Left border',
  'view.right-border': () => 'Right border',
  'view.no-borders': () => 'No borders',
  'view.borders': () => 'Borders',
  'view.border-line': () => 'The line a border is drawn with',

  'view.number-format': () => 'Number format',
  'view.number-format-now': ({ code }) => `Number format: ${code}`,
  'view.general': () => 'General',
  'view.format-as-percent': () => 'Format as percent',
  'view.fewer-decimals': () => 'Fewer decimal places',
  'view.more-decimals': () => 'More decimal places',
  'view.clear-formatting': () => 'Clear formatting',
  'view.default-font': () => 'Default',
  'view.font': () => 'Font',
  'view.font-size': () => 'Font size',
  'view.custom-colour': () => 'Custom…',

  'view.select-whole-sheet': () => 'Select the whole sheet',
  'view.go-to-an-address': () => 'Go to an address',
  'view.what-this-cell-holds': () => 'What this cell holds',
  'view.what-this-run-says': () => 'What this run of the cell says',
  'view.which-run-to-edit': () => 'Which run of this cell to edit',
  'view.find-in-this-sheet': () => 'Find in this sheet',
  'view.close-the-search': () => 'Close the search',
  'view.close-the-search-key': () => 'Close the search (Esc)',
  'view.replace-with': () => 'Replace with',
  'view.replace': () => 'Replace',
  'view.go-to-one-first': () => 'Go to one of them first',
  'view.replace-the-one': () => 'Replace the one you are on',
  'view.replace-all': () => 'Replace all',
  'view.which-of-them': ({ at, of }) => `${at} of ${of}`,
  'view.nothing-holds-that': () => 'nothing here holds that',

  'view.parameters': () => 'Parameters',
  'view.parameters-set': ({ set }) => `Parameters (${set} set)`,
  'view.count': ({ held }) => `Count ${held}`,
  'view.sum': ({ sum }) => `Sum ${sum}`,
  'view.average': ({ average }) => `Average ${average}`,
  'view.too-many-formulas': ({ limit }) =>
    `Nothing is computed here: this workbook holds more than ${limit} formulas, and computing some of them would make every total over the rest wrong.`,
  'view.not-computed': ({ names }) =>
    `Not computed here: ${names} — this preview does not model tables or workbook-defined names, so formulas that use them show as formulas.`,
  'view.and-more': ({ rest }) => `, and ${rest} more`,
  'view.leave-it-as-it-is': () => 'Leave it as it is',
  'view.write-as-override': () => 'Write it as an override',
  'view.locked-external': () =>
    'This cell cannot be typed into: its value comes from a file beside the spec. Type into it anyway to be offered an override.',
  'view.locked-mediated': () =>
    'This cell cannot be typed into: more than one thing could change to make that edit. Type into it anyway to be offered an override.',
  'view.locked-rich': () =>
    'This cell holds rich text. Pick a run in the bar over the grid to retype it; a run keeps the font it wears.',
  'view.reaches-nothing': ({ what }) => `${what} reaches no cell the grid holds`,
  'view.reaches-cells': ({ what, count }) =>
    `${what} reaches ${count} cell${count === 1 ? '' : 's'}`,
  'view.nothing-selected': () => 'Nothing selected',
  'view.nothing-writes-this-cell': () => 'Nothing writes this cell.',
  'view.also-holds-undrawn': () => 'This sheet also holds, undrawn:',
  'view.rename-or-reorder': () => 'Double-click to rename, drag to reorder',
  'view.hidden-in-excel': ({ visibility }) => `Hidden in Excel — \`${visibility}\``,
  'view.add-a-sheet': () => 'Add a sheet',
  'view.no-sheets-to-draw': () => 'This spec has no sheets to draw.',
  'view.split-where': ({ where }) =>
    `This sheet is split ${where}. The preview draws the splitter where it sits; it does not scroll the panes apart, and the bar does not move.`,

  'view.sort-a-to-z': () => 'Sort A to Z',
  'view.sort-z-to-a': () => 'Sort Z to A',
  'view.fill-down': () => 'Fill down',
  'view.fill-right': () => 'Fill right',
  'view.make-a-data-table': () => 'Make this a data table',
  'view.unmerge-cells': () => 'Unmerge cells',
  'view.merge-cells': () => 'Merge cells',
  'view.clear-contents': () => 'Clear contents',
  'view.delete': () => 'Delete',
  'view.create-a-filter': () => 'Create a filter',
  'view.remove-filter': () => 'Remove filter',
  'view.insert-a-chart': () => 'Insert a chart…',
  'view.insert-an-image': () => 'Insert an image…',
  'view.insert-note': () => 'Insert note',
  'view.edit-note': () => 'Edit note',
  'view.delete-note': () => 'Delete note',
  'view.link-to-a-page': () => 'Link to a page…',
  'view.link-to-a-cell': () => 'Link to a cell…',
  'view.edit-link': () => 'Edit link',
  'view.remove-link': () => 'Remove link',
  'view.data-validation': () => 'Data validation…',
  'view.remove-validation': () => 'Remove validation',
  'view.remove-table': () => 'Remove table',
  'view.format-as-table': () => 'Format as table',
  'view.paste': () => 'Paste',
  'view.paste-is-the-keyboards': ({ chord }) =>
    `Press ${chord}: the clipboard is the keyboard’s to give`,
  'view.insert-before': ({ many, axis }) =>
    `Insert ${bands(many, axis)} ${axis === 'column' ? 'left' : 'above'}`,
  'view.insert-after': ({ many, axis }) =>
    `Insert ${bands(many, axis)} ${axis === 'column' ? 'right' : 'below'}`,
  'view.delete-bands': ({ many, axis }) =>
    `Delete ${many === 1 ? `this ${axis}` : bands(many, axis)}`,
  'view.hide-bands': ({ many, axis }) =>
    many === 1 ? `Hide this ${axis}` : `Hide these ${bands(many, axis)}`,
  'view.show-again': ({ span }) => `Show ${span} again`,
  'view.group-bands': ({ many, axis }) =>
    many === 1 ? `Group this ${axis}` : `Group these ${bands(many, axis)}`,
  'view.take-out-of-the-outline': () => 'Take out of the outline',
  'view.open-run': ({ span }) => `Open ${span}`,
  'view.collapse-run': ({ span }) => `Collapse ${span}`,
  'view.rename': () => 'Rename',
  'view.hide': () => 'Hide',
  'view.unhide': () => 'Unhide',
  'view.gridlines': () => 'Gridlines',
  'view.tab-colour': () => 'Tab colour',
  'view.no-tab-colour': () => 'No tab colour',

  'view.unlocked-cell': () =>
    'Excel will let a reader type into this one; the rest of the sheet is locked.',
  'view.written-as-an-override': () => 'written as an override',
  'view.cannot-be-typed-into': ({ why }) => `cannot be typed into: ${why}`,
  'view.standing-rich': () => 'it holds rich text, edited a run at a time in the bar',
  'view.standing-external': () => 'its value comes from a file beside the spec',
  'view.standing-mediated': () => 'more than one thing could change to make that edit',
  'view.heads-a-table': () => 'This row heads a table',
  'view.heads-the-table': ({ name }) => `This row heads the table ${name}`,
  'view.column-is-filtered': () => 'This column has a filter; the preview does not filter by it',
  'view.a-note': () => 'a note',
  'view.a-list': () => 'Draft, Sent, Paid',
  'view.a-chart': ({ type }) => `A ${type} chart. This preview sketches it; Excel draws it.`,
  'view.chart-over': ({ name, values, categories }) => `${name}: ${values} over ${categories}`,
  'view.chart-axis': ({ which, title, ends }) => `${which} axis:${title}${ends}`.trim(),
  'view.chart-from': ({ min }) => `from ${min}`,
  'view.chart-to': ({ max }) => `to ${max}`,
};

/** A run of rows or columns, as English counts them: `3 columns`, `1 row`. */
function bands(many: number, axis: string): string {
  return many === 1 ? axis : `${many} ${axis}s`;
}

/** A row or a column, as Japanese names it. */
function unit(axis: string): string {
  return axis === 'column' ? '列' : '行';
}

const ja: Words<Says> = {
  'view.span-one': ({ axis, at }) => `${at} ${unit(axis)}`,
  'view.span-many': ({ axis, from, to }) => `${from}〜${to} ${unit(axis)}`,

  'view.freeze-panes': () => 'ウィンドウ枠の固定',
  'view.freeze-up-to': ({ at }) => `${at} まで固定`,
  'view.the-selected-cell': () => '選択中のセル',
  'view.no-frozen-panes': () => '固定しない',
  'view.bold': () => '太字',
  'view.italic': () => '斜体',
  'view.underline': () => '下線',
  'view.strikethrough': () => '取り消し線',
  'view.wrap-text': () => '折り返して全体を表示',
  'view.text-colour': () => '文字色',
  'view.automatic-text-colour': () => '文字色を自動に戻す',
  'view.fill': () => '塗りつぶし',
  'view.no-fill': () => '塗りつぶしなし',
  'view.align-left': () => '左揃え',
  'view.align-centre': () => '中央揃え',
  'view.align-right': () => '右揃え',
  'view.align-top': () => '上揃え',
  'view.align-middle': () => '上下中央揃え',
  'view.align-bottom': () => '下揃え',
  'view.all-borders': () => 'すべての罫線',
  'view.top-border': () => '上罫線',
  'view.bottom-border': () => '下罫線',
  'view.left-border': () => '左罫線',
  'view.right-border': () => '右罫線',
  'view.no-borders': () => '枠なし',
  'view.borders': () => '罫線',
  'view.border-line': () => '罫線の種類',

  'view.number-format': () => '表示形式',
  'view.number-format-now': ({ code }) => `表示形式: ${code}`,
  'view.general': () => '標準',
  'view.format-as-percent': () => 'パーセント表示',
  'view.fewer-decimals': () => '小数点以下の桁数を減らす',
  'view.more-decimals': () => '小数点以下の桁数を増やす',
  'view.clear-formatting': () => '書式をクリア',
  'view.default-font': () => '既定',
  'view.font': () => 'フォント',
  'view.font-size': () => 'フォントサイズ',
  'view.custom-colour': () => 'ユーザー設定…',

  'view.select-whole-sheet': () => 'シート全体を選択',
  'view.go-to-an-address': () => 'セル番地へ移動',
  'view.what-this-cell-holds': () => 'このセルの内容',
  'view.what-this-run-says': () => 'このセルの、この部分の文字列',
  'view.which-run-to-edit': () => '編集する部分',
  'view.find-in-this-sheet': () => 'このシート内を検索',
  'view.close-the-search': () => '検索を閉じる',
  'view.close-the-search-key': () => '検索を閉じる (Esc)',
  'view.replace-with': () => '置換後の文字列',
  'view.replace': () => '置換',
  'view.go-to-one-first': () => 'まず 1 件に移動してください',
  'view.replace-the-one': () => 'いま見ている 1 件を置換',
  'view.replace-all': () => 'すべて置換',
  'view.which-of-them': ({ at, of }) => `${of} 件中 ${at} 件目`,
  'view.nothing-holds-that': () => 'ここにはありません',

  'view.parameters': () => 'パラメータ',
  'view.parameters-set': ({ set }) => `パラメータ（${set} 件を指定）`,
  'view.count': ({ held }) => `データの個数 ${held}`,
  'view.sum': ({ sum }) => `合計 ${sum}`,
  'view.average': ({ average }) => `平均 ${average}`,
  'view.too-many-formulas': ({ limit }) =>
    `ここでは何も計算していません。このブックは数式を ${limit} 個より多く持っており、一部だけを計算すると、残りを含む集計がすべて誤りになるためです。`,
  'view.not-computed': ({ names }) =>
    `ここでは計算していません: ${names} — このプレビューはテーブルとブック定義の名前をモデル化していないため、それらを使う数式は数式のまま表示します。`,
  'view.and-more': ({ rest }) => `、ほか ${rest} 件`,
  'view.leave-it-as-it-is': () => 'そのままにする',
  'view.write-as-override': () => 'オーバーライドとして書く',
  'view.locked-external': () =>
    'このセルには直接入力できません。値が spec の隣のファイルから来ているためです。そのまま入力すると、オーバーライドが提案されます。',
  'view.locked-mediated': () =>
    'このセルには直接入力できません。その編集を行う方法が複数あるためです。そのまま入力すると、オーバーライドが提案されます。',
  'view.locked-rich': () =>
    'このセルはリッチテキストです。グリッド上のバーで部分を選んで入力してください。各部分はそれぞれのフォントを保ちます。',
  'view.reaches-nothing': ({ what }) => `${what} はグリッドが持つどのセルにも届いていません`,
  'view.reaches-cells': ({ what, count }) => `${what} は ${count} セルに届いています`,
  'view.nothing-selected': () => '選択なし',
  'view.nothing-writes-this-cell': () => 'このセルを書いているものはありません。',
  'view.also-holds-undrawn': () => 'このシートには、描画していない次のものもあります:',
  'view.rename-or-reorder': () => 'ダブルクリックで名前変更、ドラッグで並べ替え',
  'view.hidden-in-excel': ({ visibility }) => `Excel では非表示 — \`${visibility}\``,
  'view.add-a-sheet': () => 'シートを追加',
  'view.no-sheets-to-draw': () => 'この spec には描画するシートがありません。',
  'view.split-where': ({ where }) =>
    `このシートは${where}で分割されています。プレビューは分割バーをその位置に描くだけで、ペインを別々にスクロールすることも、バーを動かすこともしません。`,

  'view.sort-a-to-z': () => '昇順に並べ替え',
  'view.sort-z-to-a': () => '降順に並べ替え',
  'view.fill-down': () => '下方向にコピー',
  'view.fill-right': () => '右方向にコピー',
  'view.make-a-data-table': () => 'データテーブルにする',
  'view.unmerge-cells': () => 'セルの結合を解除',
  'view.merge-cells': () => 'セルを結合',
  'view.clear-contents': () => '内容をクリア',
  'view.delete': () => '削除',
  'view.create-a-filter': () => 'フィルタを作成',
  'view.remove-filter': () => 'フィルタを削除',
  'view.insert-a-chart': () => 'グラフを挿入…',
  'view.insert-an-image': () => '画像を挿入…',
  'view.insert-note': () => 'メモを挿入',
  'view.edit-note': () => 'メモを編集',
  'view.delete-note': () => 'メモを削除',
  'view.link-to-a-page': () => 'ページへのリンク…',
  'view.link-to-a-cell': () => 'セルへのリンク…',
  'view.edit-link': () => 'リンクを編集',
  'view.remove-link': () => 'リンクを削除',
  'view.data-validation': () => '入力規則…',
  'view.remove-validation': () => '入力規則を削除',
  'view.remove-table': () => 'テーブルを解除',
  'view.format-as-table': () => 'テーブルとして書式設定',
  'view.paste': () => '貼り付け',
  'view.paste-is-the-keyboards': ({ chord }) =>
    `${chord} を押してください。クリップボードはキーボードからしか渡せません`,
  'view.insert-before': ({ many, axis }) =>
    `${many} ${unit(axis)}を${axis === 'column' ? '左' : '上'}に挿入`,
  'view.insert-after': ({ many, axis }) =>
    `${many} ${unit(axis)}を${axis === 'column' ? '右' : '下'}に挿入`,
  'view.delete-bands': ({ many, axis }) => `${many} ${unit(axis)}を削除`,
  'view.hide-bands': ({ many, axis }) => `${many} ${unit(axis)}を非表示`,
  'view.show-again': ({ span }) => `${span} を再表示`,
  'view.group-bands': ({ many, axis }) => `${many} ${unit(axis)}をグループ化`,
  'view.take-out-of-the-outline': () => 'アウトラインから外す',
  'view.open-run': ({ span }) => `${span} を開く`,
  'view.collapse-run': ({ span }) => `${span} を折りたたむ`,
  'view.rename': () => '名前を変更',
  'view.hide': () => '非表示',
  'view.unhide': () => '再表示',
  'view.gridlines': () => '枠線',
  'view.tab-colour': () => 'タブの色',
  'view.no-tab-colour': () => 'タブの色なし',

  'view.unlocked-cell': () =>
    'Excel ではこのセルにだけ入力できます。シートの残りはロックされています。',
  'view.written-as-an-override': () => 'オーバーライドとして書かれています',
  'view.cannot-be-typed-into': ({ why }) => `直接入力できません: ${why}`,
  'view.standing-rich': () => 'リッチテキストで、バーで部分ごとに編集します',
  'view.standing-external': () => '値が spec の隣のファイルから来ています',
  'view.standing-mediated': () => 'その編集を行う方法が複数あります',
  'view.heads-a-table': () => 'この行はテーブルの見出しです',
  'view.heads-the-table': ({ name }) => `この行はテーブル ${name} の見出しです`,
  'view.column-is-filtered': () =>
    'この列にはフィルタがあります。プレビューはフィルタで絞り込みません',
  'view.a-note': () => 'メモ',
  'view.a-list': () => '下書き, 送付済, 入金済',
  'view.a-chart': ({ type }) =>
    `${type} グラフです。このプレビューは概形を描くだけで、実際の描画は Excel が行います。`,
  'view.chart-over': ({ name, values, categories }) => `${name}: ${values}（${categories} 別）`,
  'view.chart-axis': ({ which, title, ends }) => `${which} 軸:${title}${ends}`.trim(),
  'view.chart-from': ({ min }) => `${min} から`,
  'view.chart-to': ({ max }) => `${max} まで`,
};

/** This package's sentences in every language, for the page that words them. */
export const WORDS: Book = { en, ja };
