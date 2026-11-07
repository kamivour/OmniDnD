import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('follows the device only for System', () => {
    expect(resolveTheme('system', true)).toBe('parchment');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('parchment', false)).toBe('parchment');
  });
});
