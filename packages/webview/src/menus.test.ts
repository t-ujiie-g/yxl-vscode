// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { entry, fit, type Menu, opens } from './menus';
import type { Asks, Showing } from './showing';

const menu: Menu = { name: 'fill', title: 'Fill', disabled: false, marks: [] };

const asks = (openMenu = vi.fn()): Asks => ({ openMenu }) as unknown as Asks;
const showing = (open: string | null): Showing => ({ menu: open }) as unknown as Showing;

/** A panel with something in it, so an empty one cannot pass for a closed menu. */
const panel = () => {
  const box = document.createElement('div');
  box.append(entry('No fill', {}, () => {}));
  return box;
};

describe('a control that opens a panel', () => {
  it('is only the button while it is shut', () => {
    const box = opens(menu, showing(null), asks(), panel);

    expect(box.querySelectorAll('button')).toHaveLength(1);
    expect(box.querySelector('.panel')).toBeNull();
    expect(box.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('asks for itself by name, and to be shut again while it is open', () => {
    const openMenu = vi.fn();
    opens(menu, showing(null), asks(openMenu), panel).querySelector('button')?.click();
    expect(openMenu).toHaveBeenCalledWith('fill');

    opens(menu, showing('fill'), asks(openMenu), panel).querySelector('button')?.click();
    expect(openMenu).toHaveBeenLastCalledWith(null);
  });

  it('holds the panel and the scrim that closes it where it is open', () => {
    const openMenu = vi.fn();
    const box = opens(menu, showing('fill'), asks(openMenu), panel);

    expect(box.querySelector('.panel .entry')?.textContent).toBe('No fill');
    box.querySelector('.scrim')?.dispatchEvent(new MouseEvent('mousedown'));
    expect(openMenu).toHaveBeenCalledWith(null);
  });

  it('closes on `Esc`, without taking the key from the grid behind it', () => {
    const openMenu = vi.fn();
    const box = opens(menu, showing('fill'), asks(openMenu), panel);

    box
      .querySelector('.entry')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(openMenu).toHaveBeenCalledWith(null);
  });

  it('stays shut where the control is disabled, whatever the view thinks is open', () => {
    const box = opens({ ...menu, disabled: true }, showing('fill'), asks(), panel);

    expect(box.querySelector('.panel')).toBeNull();
    expect(box.querySelector('button')?.disabled).toBe(true);
  });
});

describe('a panel that would hang past the edge of the view', () => {
  /** A panel of `width` whose left edge sits at `left`, in a view `wide` across. */
  function laid(left: number, width: number, wide: number): HTMLElement {
    const into = document.createElement('div');
    const box = document.createElement('div');

    box.className = 'panel';
    box.getBoundingClientRect = () => ({ left, right: left + width, width }) as unknown as DOMRect;
    into.append(box);
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: wide,
      configurable: true,
    });

    fit(into);
    return box;
  }

  it('is pulled back onto it, by what it hangs over', () => {
    expect(laid(700, 200, 800).style.left).toBe('-108px');
  });

  it('is left where it was drawn when it already fits', () => {
    expect(laid(100, 200, 800).style.left).toBe('');
  });
});
