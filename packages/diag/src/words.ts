/** The languages this editor reads in; the reader's own is VS Code's (ADR-051). */
export type Language = 'en' | 'ja';

/** What a sentence is filled with: values a language may put in its own order, never prose. */
export type Args = Readonly<Record<string, string | number>>;

/** What fills a sentence that takes nothing. */
export type Nothing = Record<never, never>;

/** A sentence as the core says it: which one, and what goes in it (ADR-051). */
export interface Message {
  readonly id: string;
  readonly args: Args;
}

/** A sentence during the pass to messages: prose from a site not yet converted, or a message (ADR-051). */
export type Saying = string | Message;

/** One sentence in one language. */
export type Sentence<A extends Args = Args> = (args: A) => string;

/** The ids a package declares, each with what fills its sentence. */
export type Speech = Record<string, Args>;

/** Every sentence a package says, in one language; the compiler holds each language to the same list. */
export type Words<S extends Speech> = { readonly [K in keyof S]: Sentence<S[K]> };

/** A package's sentences in every language, which is what it hands the edge that words them. */
export type Book = Readonly<Record<Language, Readonly<Record<string, (args: never) => string>>>>;

/**
 * A package's own way to say one of its sentences, typed against the ids it
 * declares — an id it has not declared, or an argument its sentence does not
 * take, is a compile error.
 */
export function speaking<S extends Speech>() {
  return <K extends keyof S & string>(
    id: K,
    ...args: keyof S[K] extends never ? [] : [S[K]]
  ): Message => ({ id, args: args[0] ?? {} });
}

/**
 * How an edge turns what the core said into the sentence a reader reads
 * (ADR-051). A sentence the reader's language does not have falls back to
 * English, and an id no book holds renders as itself.
 */
export function reading(language: Language, ...books: readonly Book[]): (saying: Saying) => string {
  const held = new Map<string, Sentence>();
  for (const book of books) {
    for (const [id, sentence] of Object.entries(book.en)) held.set(id, sentence as Sentence);
  }
  if (language !== 'en') {
    for (const book of books) {
      for (const [id, sentence] of Object.entries(book[language]))
        held.set(id, sentence as Sentence);
    }
  }

  return (saying) => {
    if (typeof saying === 'string') return saying;
    const sentence = held.get(saying.id);
    return sentence === undefined ? saying.id : sentence(saying.args);
  };
}
