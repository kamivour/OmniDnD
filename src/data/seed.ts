import seed from '../../data/characters/the-fool.json';
import { ExportFileSchema, type ExportFile } from '../engine/schema';

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
