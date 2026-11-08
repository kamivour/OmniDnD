import type { Tool, ToolObjective, ToolPlatform } from '../schema';
import { TOOL_OBJECTIVES } from '../schema';

export const TOOL_OBJECTIVE_LABELS: Record<ToolObjective, string> = {
  vtt: 'Play online',
  maps: 'Maps and battle maps',
  generators: 'Dungeon and town generators',
  tokens: 'Tokens',
  minis: 'Miniatures and 3D printing',
  'ai-3d': 'AI art and 3D pipeline',
  audio: 'Music and ambience',
  builders: 'Character builders and rules lookup',
  prep: 'DM prep and campaign notes',
  'other-systems': 'Other game systems',
};

export interface ToolFilter {
  freeOnly: boolean;
  platform: ToolPlatform | 'any';
  /** Hide tools that use generative AI. */
  hideAi: boolean;
  query: string;
}

export const NO_TOOL_FILTER: ToolFilter = {
  freeOnly: false,
  platform: 'any',
  hideAi: false,
  query: '',
};

/** Free only keeps `free` and `freemium` tools; paid-only tools drop out. */
export function filterTools(tools: readonly Tool[], filter: ToolFilter): Tool[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return tools.filter((tool) => {
    if (filter.freeOnly && tool.cost === 'paid') return false;
    if (filter.platform !== 'any' && !tool.platforms.includes(filter.platform)) return false;
    if (filter.hideAi && tool.ai) return false;
    if (words.length === 0) return true;
    const text = [tool.name, tool.summary, ...tool.synonyms].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Groups in objective order; empty groups are left out. */
export function groupTools(
  tools: readonly Tool[],
): { objective: ToolObjective; label: string; tools: Tool[] }[] {
  return TOOL_OBJECTIVES.map((objective) => ({
    objective,
    label: TOOL_OBJECTIVE_LABELS[objective],
    tools: tools.filter((tool) => tool.objective === objective),
  })).filter((group) => group.tools.length > 0);
}
