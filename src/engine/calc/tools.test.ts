import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../data/tools';
import { TOOL_OBJECTIVES } from '../schema';
import { NO_TOOL_FILTER, filterTools, groupTools } from './tools';

describe('tools directory', () => {
  it('has tools under every objective', () => {
    expect(groupTools(TOOLS).map((group) => group.objective)).toEqual([...TOOL_OBJECTIVES]);
  });

  it('free only drops paid tools but keeps freemium', () => {
    const free = filterTools(TOOLS, { ...NO_TOOL_FILTER, freeOnly: true });
    expect(free.some((tool) => tool.cost === 'paid')).toBe(false);
    expect(free.some((tool) => tool.cost === 'freemium')).toBe(true);
  });

  it('finds a free web map maker with AI hidden', () => {
    const found = filterTools(TOOLS, {
      freeOnly: true,
      platform: 'web',
      hideAi: true,
      query: 'map maker',
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((tool) => !tool.ai && tool.platforms.includes('web'))).toBe(true);
  });

  it('hide AI removes every AI tool', () => {
    const shown = filterTools(TOOLS, { ...NO_TOOL_FILTER, hideAi: true });
    expect(shown.some((tool) => tool.ai)).toBe(false);
    expect(shown.length).toBeLessThan(TOOLS.length);
  });

  it('search matches synonyms', () => {
    const found = filterTools(TOOLS, { ...NO_TOOL_FILTER, query: 'stl' });
    expect(found.map((tool) => tool.id)).toContain('tool.printables');
  });
});
