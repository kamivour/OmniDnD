import { deserializeWorkspace, serializeWorkspace } from '../db/database';
import { equalData } from '../engine/commands/management';
import { ExportFileSchema, SCHEMA_VERSION, type ExportFile } from '../engine/schema';
import type { CharacterStoreState } from '../state/character-store';

type Source = Pick<CharacterStoreState, 'characters' | 'campaigns'>;

export function characterExport(state: Source, id: string, exportedAt: string): ExportFile {
  const record = Object.hasOwn(state.characters, id) ? state.characters[id] : undefined;
  if (!record) throw new Error('Character not found');
  const campaign = Object.hasOwn(state.campaigns, record.build.campaignId)
    ? state.campaigns[record.build.campaignId]
    : undefined;
  return ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    campaign,
    ...record,
  });
}

function validateFile(file: ExportFile) {
  deserializeWorkspace(
    serializeWorkspace({
      campaigns: { [file.campaign.id]: file.campaign },
      characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
      automation: 'assisted',
      managementEvents: [],
      bookmarks: [],
      reducedMotion: false,
    }),
  );
}

/** Import never replaces existing characters or conflicting campaign rules. */
export function prepareCharacterImport(
  raw: unknown,
  state: Source,
  makeId: () => string,
): { file: ExportFile; notes: string[] } {
  const file = ExportFileSchema.parse(raw);
  validateFile(file);
  const notes: string[] = [];
  let remapped = false;
  if (Object.hasOwn(state.characters, file.build.id)) {
    const id = makeId();
    file.build.id = id;
    file.live.characterId = id;
    file.build.name += ' (imported copy)';
    notes.push('A character with this ID already exists. This import adds a separate copy.');
    remapped = true;
  }
  const existing = Object.hasOwn(state.campaigns, file.campaign.id)
    ? state.campaigns[file.campaign.id]
    : undefined;
  if (existing && !equalData(existing, file.campaign)) {
    const id = makeId();
    file.campaign.id = id;
    file.campaign.name += ' (imported)';
    file.build.campaignId = id;
    notes.push('Campaign rules differ from the saved campaign. The import adds its own campaign.');
    remapped = true;
  }
  if (remapped && file.events.length > 0) {
    file.events = [];
    notes.push('The copy keeps current values and choices; its game-action history starts fresh.');
  }
  validateFile(file);
  return { file, notes };
}
