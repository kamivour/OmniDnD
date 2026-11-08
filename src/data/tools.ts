import toolsData from '../../data/content/tools.json';
import { ToolPackSchema, type Tool } from '../engine/schema';

/** Outside tools shown under Reference. Links only; nothing here is fetched. */
export const TOOLS: readonly Tool[] = ToolPackSchema.parse(toolsData);
