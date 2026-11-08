import guidanceData from '../../data/content/guidance.json';
import { type Guidance, GuidancePackSchema } from '../engine/schema';

const entries = GuidancePackSchema.parse(guidanceData);
const byId = new Map<string, Guidance>(entries.map((entry) => [entry.id, entry]));

export const allGuidance: readonly Guidance[] = entries;

/** Beginner guidance for a class, subclass, race or background id, if there is any. */
export const guidanceFor = (id: string | undefined): Guidance | undefined =>
  id === undefined ? undefined : byId.get(id);
