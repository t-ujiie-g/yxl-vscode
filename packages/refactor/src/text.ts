import { type Book, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says; an id is stable, so it is API (ADR-051). */
export type Says = {
  'refactor.gather-a-style': { sites: number };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'refactor.gather-a-style': ({ sites }) =>
    `Gather the look written at ${sites} places into one \`defs.styles\` entry`,
};

const ja: Words<Says> = {
  'refactor.gather-a-style': ({ sites }) =>
    `${sites} 箇所に書かれている同じ見た目を、\`defs.styles\` の 1 つの定義にまとめる`,
};

/** This package's sentences in every language, for the edge that renders them. */
export const WORDS: Book = { en, ja };
