import { describe, expect, it } from 'vitest';
import { characterStore } from '../state/character-store';
import { prepareWorkspaceImport, summarizeWorkspace, workspaceExport } from './workspace-files';

describe('workspace backup file', () => {
  const workspace = () => {
    const { campaigns, characters, bookmarks, automation, reducedMotion, managementEvents } =
      characterStore.getState();
    return { campaigns, characters, bookmarks, automation, reducedMotion, managementEvents };
  };

  it('round-trips the seeded workspace', () => {
    const source = workspace();
    const file = JSON.parse(JSON.stringify(workspaceExport(source, '2026-11-08T00:00:00.000Z')));
    const prepared = prepareWorkspaceImport(file);
    expect(prepared.workspace.characters).toEqual(source.characters);
    expect(prepared.summary).toEqual(summarizeWorkspace(source));
    expect(prepared.summary.characters.length).toBeGreaterThan(0);
  });

  it('rejects other files with a plain message', () => {
    expect(() => prepareWorkspaceImport({ hello: 'world' })).toThrow('not an OmniDnD backup');
    const file = JSON.parse(
      JSON.stringify(workspaceExport(workspace(), '2026-11-08T00:00:00.000Z')),
    );
    file.rows.builds[0].data.name = 42;
    expect(() => prepareWorkspaceImport(file)).toThrow('damaged');
  });
});
