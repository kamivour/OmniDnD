import { describe, expect, it } from 'vitest';
import { resolveFx, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('follows the device only for System', () => {
    expect(resolveTheme('system', true)).toBe('parchment');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('parchment', false)).toBe('parchment');
  });
});

describe('resolveFx', () => {
  const phone = { reducedMotion: false, desktop: false };
  const computer = { reducedMotion: false, desktop: true };

  it('Auto is full on computers and lite on phones', () => {
    expect(resolveFx('auto', computer)).toBe('full');
    expect(resolveFx('auto', phone)).toBe('lite');
  });

  it('Full and Off apply on any device', () => {
    expect(resolveFx('full', phone)).toBe('full');
    expect(resolveFx('off', computer)).toBe('off');
  });

  it('reduced motion always turns effects off', () => {
    expect(resolveFx('full', { reducedMotion: true, desktop: true })).toBe('off');
    expect(resolveFx('auto', { reducedMotion: true, desktop: true })).toBe('off');
  });
});
