import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration } from './clock';

describe('formatClock', () => {
  it('shows the day and time of day', () => {
    expect(formatClock(0)).toBe('Day 1, 00:00');
    expect(formatClock(8 * 3600)).toBe('Day 1, 08:00');
    expect(formatClock(24 * 3600 + 6 * 3600 + 90)).toBe('Day 2, 06:01');
  });
});

describe('formatDuration', () => {
  it('shows the largest units first and skips empty ones', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(6)).toBe('6 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(8 * 3600)).toBe('8 h');
    expect(formatDuration(24 * 3600)).toBe('1 day');
    expect(formatDuration(2 * 24 * 3600 + 3600)).toBe('2 days 1 h');
  });
});
