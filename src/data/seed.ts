import seed from '../../data/characters/the-fool.json';
import { ExportFileSchema, type Campaign, type ExportFile } from '../engine/schema';

/** The shipped character follows the same validation path as an imported backup. */
export const seedFile = ExportFileSchema.parse(seed);

/** Browser key that makes a fresh device start with the sample character (set by the test fixtures). */
export const SAMPLE_KEY = 'omnidnd.sample';

/** What a brand-new device starts with: nothing, unless the sample flag is set. */
export function starterFiles(): ExportFile[] {
  try {
    return localStorage.getItem(SAMPLE_KEY) === '1' ? [seedFile] : [];
  } catch {
    return [];
  }
}

/** The sample character as a fresh copy inside the given campaign, under a new id. */
export function sampleFileFor(campaign: Campaign, id: string): ExportFile {
  const file = structuredClone(seedFile);
  return {
    ...file,
    exportedAt: new Date().toISOString(),
    campaign: structuredClone(campaign),
    build: { ...file.build, id, campaignId: campaign.id },
    live: { ...file.live, characterId: id },
  };
}
