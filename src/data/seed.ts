import seed from '../../data/characters/the-fool.json';
import { ExportFileSchema } from '../engine/schema';

/** The shipped character follows the same validation path as an imported backup. */
export const seedFile = ExportFileSchema.parse(seed);
