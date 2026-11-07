import { z } from 'zod';
import { deserializeWorkspace, serializeWorkspace, type Workspace } from '../db/database';
import type { WorkspaceRows } from '../db/database';

const FORMAT = 'omnidnd-workspace';

/** A whole-workspace backup file: every campaign, character, history and bookmark on this device. */
const WorkspaceFileShape = z.strictObject({
  format: z.literal(FORMAT),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  rows: z.strictObject({
    builds: z.array(z.unknown()),
    live: z.array(z.unknown()),
    events: z.array(z.unknown()),
    campaigns: z.array(z.unknown()),
    automation: z.unknown(),
    reducedMotion: z.unknown().optional(),
    managementEvents: z.array(z.unknown()).optional(),
    bookmarks: z.array(z.unknown()).optional(),
    activityOrder: z.array(z.unknown()).optional(),
  }),
});

export interface WorkspaceSummary {
  campaigns: string[];
  characters: { name: string; campaign: string }[];
}

export function summarizeWorkspace(workspace: Workspace): WorkspaceSummary {
  return {
    campaigns: Object.values(workspace.campaigns).map(({ name }) => name),
    characters: Object.values(workspace.characters).map(({ build }) => ({
      name: build.name,
      campaign: workspace.campaigns[build.campaignId]?.name ?? 'No campaign',
    })),
  };
}

export function workspaceExport(workspace: Workspace, exportedAt: string) {
  return { format: FORMAT, version: 1, exportedAt, rows: serializeWorkspace(workspace) };
}

/** Validates the whole file before anything is shown or replaced. Throws a plain message on failure. */
export function prepareWorkspaceImport(json: unknown): {
  workspace: Workspace;
  exportedAt: string;
  summary: WorkspaceSummary;
} {
  const parsed = WorkspaceFileShape.safeParse(json);
  if (!parsed.success) throw new Error('This file is not an OmniDnD backup.');
  let workspace: Workspace;
  try {
    workspace = deserializeWorkspace(parsed.data.rows as WorkspaceRows);
  } catch (cause) {
    throw new Error(
      `This backup is damaged or from an unsupported version: ${cause instanceof Error ? cause.message : 'unknown problem'}`,
      { cause },
    );
  }
  return { workspace, exportedAt: parsed.data.exportedAt, summary: summarizeWorkspace(workspace) };
}
