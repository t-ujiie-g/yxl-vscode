/**
 * A date format with Excel's Japanese codes written out as text for the date
 * they show: `g`–`ggg` the era, `e`/`ee` its year, `aaa`/`aaaa` the weekday (#211).
 * `e` is the era's year only beside a `g` or a Japanese locale tag, as `[$-411]`.
 */
export function japanese(format: string, serial: number): string {
  if (!/[gGaAeE]/.test(format)) return format;

  const date = dateOf(serial);
  const era = ERAS.find((one) => date.getTime() >= one.from) ?? MEIJI;

  const japan = /[gG]/.test(outside(format)) || /\[\$-(411|ja)/i.test(format);
  let out = '';

  for (let at = 0; at < format.length; ) {
    const char = format[at] as string;
    const skipped = skip(format, at);
    if (skipped > at) {
      out += format.slice(at, skipped);
      at = skipped;
      continue;
    }

    const lower = char.toLowerCase();
    let end = at;
    while (format[end]?.toLowerCase() === lower) end += 1;
    const run = end - at;

    const said =
      lower === 'g'
        ? [era.letter, era.short, era.name][Math.min(run, 3) - 1]
        : lower === 'e' && japan
          ? String(date.getUTCFullYear() - era.year + 1).padStart(run >= 2 ? 2 : 1, '0')
          : lower === 'a' && run >= 3
            ? `${WEEKDAYS[date.getUTCDay()]}${run >= 4 ? '曜日' : ''}`
            : null;

    out += said === null || said === undefined ? format.slice(at, end) : `"${said}"`;
    at = end;
  }

  return out;
}

/** Japan's eras since the 1900 date system begins, newest first; each starts on its first day. */
const ERAS = [
  { from: Date.UTC(2019, 4, 1), year: 2019, letter: 'R', short: '令', name: '令和' },
  { from: Date.UTC(1989, 0, 8), year: 1989, letter: 'H', short: '平', name: '平成' },
  { from: Date.UTC(1926, 11, 25), year: 1926, letter: 'S', short: '昭', name: '昭和' },
  { from: Date.UTC(1912, 6, 30), year: 1912, letter: 'T', short: '大', name: '大正' },
];

const MEIJI = {
  from: Number.NEGATIVE_INFINITY,
  year: 1868,
  letter: 'M',
  short: '明',
  name: '明治',
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** The day a 1900-system serial names; Excel's 29 February 1900, which never was, counts as one day. */
function dateOf(serial: number): Date {
  const base = serial < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(serial) * 86_400_000);
}

/** Past a quoted string, an escaped character, a bracketed tag, or a `_x`/`*x` pair, from `at`; `at` where none starts. */
function skip(format: string, at: number): number {
  const char = format[at];
  if (char === '"') {
    const close = format.indexOf('"', at + 1);
    return close < 0 ? format.length : close + 1;
  }
  if (char === '[') {
    const close = format.indexOf(']', at + 1);
    return close < 0 ? format.length : close + 1;
  }
  return char === '\\' || char === '_' || char === '*' ? Math.min(at + 2, format.length) : at;
}

/** The format with its quoted strings, escapes and tags taken out, where a code can be looked for. */
function outside(format: string): string {
  let out = '';
  for (let at = 0; at < format.length; ) {
    const skipped = skip(format, at);
    if (skipped > at) {
      at = skipped;
      continue;
    }
    out += format[at];
    at += 1;
  }
  return out;
}
