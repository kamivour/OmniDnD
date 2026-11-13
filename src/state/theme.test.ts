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
  const phone = { systemReducedMotion: false, alwaysReduce: false, desktop: false };
  const computer = { systemReducedMotion: false, alwaysReduce: false, desktop: true };
  const calmSystem = { ...computer, systemReducedMotion: true };

  it('Auto is full on computers and lite on phones', () => {
    expect(resolveFx('auto', computer)).toBe('full');
    expect(resolveFx('auto', phone)).toBe('lite');
  });

  it('Full and Off apply on any device', () => {
    expect(resolveFx('full', phone)).toBe('full');
    expect(resolveFx('off', computer)).toBe('off');
  });

  it('system reduced motion turns Auto off, but a chosen Full wins', () => {
    expect(resolveFx('auto', calmSystem)).toBe('off');
    expect(resolveFx('full', calmSystem)).toBe('full');
  });

  it('the in-app Always reduce motion switch turns effects off even at Full', () => {
    expect(resolveFx('full', { ...computer, alwaysReduce: true })).toBe('off');
    expect(resolveFx('auto', { ...computer, alwaysReduce: true })).toBe('off');
  });
});
