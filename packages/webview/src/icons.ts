import type { DrawnIcon } from './protocol';

/** One icon as this view draws it: enough of the thing to recognise, never Excel's own (ADR-029). */
interface Glyph {
  readonly mark: string;
  readonly color: string;
}

const RED = '#c00000';
const AMBER = '#e8a33d';
const GREEN = '#2e8b57';
const GREY = '#8a8a8a';
const BLACK = '#3a3a3a';
const PINK = '#e06666';

const ARROWS = ['↓', '↘', '→', '↗', '↑'];
const LIGHTS = [RED, AMBER, GREEN];

/** The three of five arrows a three-icon set uses, which are the down, the level, and the up. */
function arrows(many: number, colors: readonly string[]): Glyph[] {
  const marks = many === 3 ? ['↓', '→', '↑'] : many === 4 ? ['↓', '↘', '↗', '↑'] : ARROWS;
  return marks.map((mark, at) => ({ mark, color: colors[at] ?? GREY }));
}

function shaded(marks: readonly string[], color: string): Glyph[] {
  return marks.map((mark) => ({ mark, color }));
}

/** Every set the base schema names, as the marks this view draws for it (`docs/spec.md` §10). */
const SETS: Readonly<Record<string, readonly Glyph[]>> = {
  '3Arrows': arrows(3, LIGHTS),
  '3ArrowsGray': arrows(3, [GREY, GREY, GREY]),
  '3Flags': shaded(['⚑', '⚑', '⚑'], GREY).map((one, at) => ({ ...one, color: LIGHTS[at] ?? GREY })),
  '3Signs': [
    { mark: '◆', color: RED },
    { mark: '▲', color: AMBER },
    { mark: '●', color: GREEN },
  ],
  '3Symbols': [
    { mark: '⊗', color: RED },
    { mark: '⚠', color: AMBER },
    { mark: '✓', color: GREEN },
  ],
  '3Symbols2': [
    { mark: '✗', color: RED },
    { mark: '!', color: AMBER },
    { mark: '✓', color: GREEN },
  ],
  '3TrafficLights1': shaded(['●', '●', '●'], RED).map((one, at) => ({
    ...one,
    color: LIGHTS[at] ?? GREY,
  })),
  '3TrafficLights2': shaded(['■', '■', '■'], RED).map((one, at) => ({
    ...one,
    color: LIGHTS[at] ?? GREY,
  })),
  '4Arrows': arrows(4, [RED, AMBER, AMBER, GREEN]),
  '4ArrowsGray': arrows(4, [GREY, GREY, GREY, GREY]),
  '4Rating': ['▁', '▃', '▅', '▇'].map((mark) => ({ mark, color: BLACK })),
  '4RedToBlack': [
    { mark: '●', color: RED },
    { mark: '●', color: PINK },
    { mark: '●', color: GREY },
    { mark: '●', color: BLACK },
  ],
  '4TrafficLights': [
    { mark: '●', color: BLACK },
    { mark: '●', color: RED },
    { mark: '●', color: AMBER },
    { mark: '●', color: GREEN },
  ],
  '5Arrows': arrows(5, [RED, AMBER, AMBER, GREEN, GREEN]),
  '5ArrowsGray': arrows(5, [GREY, GREY, GREY, GREY, GREY]),
  '5Quarters': ['○', '◔', '◑', '◕', '●'].map((mark) => ({ mark, color: BLACK })),
  '5Rating': ['▁', '▂', '▄', '▆', '█'].map((mark) => ({ mark, color: BLACK })),
};

/** The mark a cell wears for its rule, or `null` for a set this view has no marks for. */
export function iconOf(icon: DrawnIcon): HTMLElement | null {
  const glyph = SETS[icon.set]?.[icon.index];
  if (glyph === undefined) return null;

  const drawn = document.createElement('span');
  drawn.className = 'icon';
  drawn.textContent = glyph.mark;
  drawn.style.color = glyph.color;
  drawn.title = `${icon.set}, icon ${icon.index + 1}`;

  return drawn;
}
