import { describe, expect, it } from 'vitest';
import { ToolPackSchema } from '../engine/schema';
import { TOOLS } from './tools';

describe('tools directory', () => {
  it('parses and has unique ids and urls', () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    expect(new Set(TOOLS.map((tool) => tool.id)).size).toBe(TOOLS.length);
  });

  it('rejects duplicate ids and urls', () => {
    const one = { ...TOOLS[0]! };
    expect(ToolPackSchema.safeParse([one, one]).success).toBe(false);
    expect(
      ToolPackSchema.safeParse([one, { ...one, id: 'tool.other', url: `${one.url}/` }]).success,
    ).toBe(false);
  });
});
