import { describe, expect, it } from 'vitest';
import { ExportFileSchema } from '../schema';
import {
  addLocation,
  addNpc,
  addQuest,
  addSessionNote,
  editLocation,
  editNpc,
  editQuest,
  editSessionNote,
  removeLocation,
  removeNpc,
  removeQuest,
  removeSessionNote,
  updateJournalNarrative,
} from './journal';
import { freshState, Session } from './test-utils';

function reload(session: Session) {
  const json = JSON.stringify({
    app: 'omnidnd',
    schemaVersion: 1,
    exportedAt: '2026-11-06T00:00:00.000Z',
    ...session.state,
    events: session.events,
  });
  const file = ExportFileSchema.parse(JSON.parse(json));
  session.state = { campaign: file.campaign, build: file.build, live: file.live };
  session.events = file.events;
  return json;
}

describe('journal commands', () => {
  it('updates narrative fields and undo restores previous state', () => {
    const session = new Session(freshState);
    const before = structuredClone(session.state);

    const narrative = {
      personality: 'Bold and courageous.',
      ideals: 'Freedom for all.',
      bonds: 'Loyal to the party.',
      flaws: 'Reckless in battle.',
      relationships: 'Friend of Elrond.',
      backstory: 'Born in a small village.',
      appearance: { hair: 'black', eyes: 'green', height: '6 ft' },
      notes: 'Remember to buy rations.',
    };

    const text = session.run(updateJournalNarrative, narrative);
    expect(text).toBe('Update character journal');
    expect(session.state.build.journal.personality).toBe('Bold and courageous.');
    expect(session.state.build.journal.ideals).toBe('Freedom for all.');
    expect(session.state.build.journal.relationships).toBe('Friend of Elrond.');
    expect(session.state.build.journal.appearance?.hair).toBe('black');

    reload(session);
    expect(session.state.build.journal.personality).toBe('Bold and courageous.');

    session.undo();
    expect(session.state.build.journal).toEqual(before.build.journal);
  });

  describe('quests', () => {
    it('adds, edits, completes and removes a quest with exact Undo', () => {
      const session = new Session(freshState);
      const before = structuredClone(session.state);

      const quest = {
        id: 'quest-1',
        title: 'Find the ancient artifact',
        status: 'open' as const,
        notes: 'Rumored to be in the Sunken Temple',
      };

      expect(session.run(addQuest, { quest })).toBe('Add quest: Find the ancient artifact');
      expect(session.state.build.journal.quests).toHaveLength(1);
      expect(session.state.build.journal.quests?.[0]?.title).toBe('Find the ancient artifact');

      // Edit quest notes
      expect(
        session.run(editQuest, {
          quest: { ...quest, notes: 'Found the entrance to the temple' },
        }),
      ).toBe('Edit quest: Find the ancient artifact');
      expect(session.state.build.journal.quests?.[0]?.notes).toBe(
        'Found the entrance to the temple',
      );

      // Complete quest
      expect(session.run(editQuest, { quest: { ...quest, status: 'done' } })).toBe(
        'Complete quest: Find the ancient artifact',
      );
      expect(session.state.build.journal.quests?.[0]?.status).toBe('done');

      reload(session);
      expect(session.state.build.journal.quests?.[0]?.status).toBe('done');

      // Remove quest
      expect(session.run(removeQuest, { questId: 'quest-1' })).toBe(
        'Remove quest: Find the ancient artifact',
      );
      expect(session.state.build.journal.quests).toHaveLength(0);

      // Undo removal
      session.undo();
      expect(session.state.build.journal.quests?.[0]?.status).toBe('done');

      // Undo completion
      session.undo();
      expect(session.state.build.journal.quests?.[0]?.status).toBe('open');

      // Undo edit
      session.undo();
      expect(session.state.build.journal.quests?.[0]?.notes).toBe(
        'Rumored to be in the Sunken Temple',
      );

      // Undo add
      session.undo();
      expect(session.state.build.journal).toEqual(before.build.journal);
    });

    it('blocks duplicate quest IDs and non-existent quest edits', () => {
      const session = new Session(freshState);
      const quest = { id: 'quest-1', title: 'Find artifact', status: 'open' as const };
      session.run(addQuest, { quest });

      expect(session.preview(addQuest, { quest })).toEqual({
        result: 'blocked',
        reasons: ['A quest with this id already exists'],
      });
      expect(
        session.preview(editQuest, {
          quest: { id: 'quest-2', title: 'Other', status: 'open' as const },
        }),
      ).toEqual({
        result: 'blocked',
        reasons: ['Quest does not exist'],
      });
      expect(session.preview(removeQuest, { questId: 'quest-2' })).toEqual({
        result: 'blocked',
        reasons: ['Quest does not exist'],
      });
    });
  });

  describe('NPCs', () => {
    it('adds, edits, and removes an NPC with exact Undo', () => {
      const session = new Session(freshState);
      const before = structuredClone(session.state);

      const npc = {
        id: 'npc-1',
        name: 'Gundren Rockseeker',
        location: 'Neverwinter',
        relationship: 'Patron',
        notes: 'Hired us for escort duty',
      };

      expect(session.run(addNpc, { npc })).toBe('Add NPC: Gundren Rockseeker');
      expect(session.state.build.journal.npcs).toHaveLength(1);
      expect(session.state.build.journal.npcs?.[0]?.location).toBe('Neverwinter');

      expect(
        session.run(editNpc, { npc: { ...npc, location: 'Cragmaw Hideout', notes: 'Captured!' } }),
      ).toBe('Edit NPC: Gundren Rockseeker');
      expect(session.state.build.journal.npcs?.[0]?.location).toBe('Cragmaw Hideout');

      reload(session);

      expect(session.run(removeNpc, { npcId: 'npc-1' })).toBe('Remove NPC: Gundren Rockseeker');
      expect(session.state.build.journal.npcs).toHaveLength(0);

      session.undo();
      expect(session.state.build.journal.npcs?.[0]?.location).toBe('Cragmaw Hideout');

      session.undo();
      expect(session.state.build.journal.npcs?.[0]?.location).toBe('Neverwinter');

      session.undo();
      expect(session.state.build.journal).toEqual(before.build.journal);
    });

    it('blocks duplicate NPC IDs and non-existent NPC edits', () => {
      const session = new Session(freshState);
      const npc = { id: 'npc-1', name: 'Gundren' };
      session.run(addNpc, { npc });

      expect(session.preview(addNpc, { npc })).toEqual({
        result: 'blocked',
        reasons: ['An NPC with this id already exists'],
      });
      expect(session.preview(editNpc, { npc: { id: 'npc-2', name: 'Other' } })).toEqual({
        result: 'blocked',
        reasons: ['NPC does not exist'],
      });
      expect(session.preview(removeNpc, { npcId: 'npc-2' })).toEqual({
        result: 'blocked',
        reasons: ['NPC does not exist'],
      });
    });
  });

  describe('locations', () => {
    it('adds, edits, and removes a location with exact Undo', () => {
      const session = new Session(freshState);
      const before = structuredClone(session.state);

      const location = {
        id: 'loc-1',
        name: 'Phandalin',
        notes: 'Mining town on the frontier',
      };

      expect(session.run(addLocation, { location })).toBe('Add location: Phandalin');
      expect(session.state.build.journal.locations).toHaveLength(1);

      expect(
        session.run(editLocation, {
          location: { ...location, notes: 'Town under Redbrand threat' },
        }),
      ).toBe('Edit location: Phandalin');
      expect(session.state.build.journal.locations?.[0]?.notes).toBe('Town under Redbrand threat');

      reload(session);

      expect(session.run(removeLocation, { locationId: 'loc-1' })).toBe(
        'Remove location: Phandalin',
      );
      expect(session.state.build.journal.locations).toHaveLength(0);

      session.undo();
      expect(session.state.build.journal.locations?.[0]?.name).toBe('Phandalin');

      session.undo();
      expect(session.state.build.journal.locations?.[0]?.notes).toBe('Mining town on the frontier');

      session.undo();
      expect(session.state.build.journal).toEqual(before.build.journal);
    });

    it('blocks duplicate location IDs and non-existent location edits', () => {
      const session = new Session(freshState);
      const location = { id: 'loc-1', name: 'Phandalin' };
      session.run(addLocation, { location });

      expect(session.preview(addLocation, { location })).toEqual({
        result: 'blocked',
        reasons: ['A location with this id already exists'],
      });
      expect(session.preview(editLocation, { location: { id: 'loc-2', name: 'Other' } })).toEqual({
        result: 'blocked',
        reasons: ['Location does not exist'],
      });
      expect(session.preview(removeLocation, { locationId: 'loc-2' })).toEqual({
        result: 'blocked',
        reasons: ['Location does not exist'],
      });
    });
  });

  describe('session notes', () => {
    it('adds, edits, and removes a session note with exact Undo', () => {
      const session = new Session(freshState);
      const before = structuredClone(session.state);

      const sessionNote = {
        id: 'note-1',
        date: '2026-11-06',
        title: 'Session 1: The Road to Phandalin',
        text: 'Met at the tavern, ambushed by goblins.',
      };

      expect(session.run(addSessionNote, { sessionNote })).toBe(
        'Add session note: Session 1: The Road to Phandalin',
      );
      expect(session.state.build.journal.sessionNotes).toHaveLength(1);

      expect(
        session.run(editSessionNote, {
          sessionNote: { ...sessionNote, text: 'Defeated the goblins and tracked their hideout.' },
        }),
      ).toBe('Edit session note: Session 1: The Road to Phandalin');
      expect(session.state.build.journal.sessionNotes?.[0]?.text).toBe(
        'Defeated the goblins and tracked their hideout.',
      );

      reload(session);

      expect(session.run(removeSessionNote, { sessionNoteId: 'note-1' })).toBe(
        'Remove session note: Session 1: The Road to Phandalin',
      );
      expect(session.state.build.journal.sessionNotes).toHaveLength(0);

      session.undo();
      expect(session.state.build.journal.sessionNotes?.[0]?.text).toBe(
        'Defeated the goblins and tracked their hideout.',
      );

      session.undo();
      expect(session.state.build.journal.sessionNotes?.[0]?.text).toBe(
        'Met at the tavern, ambushed by goblins.',
      );

      session.undo();
      expect(session.state.build.journal).toEqual(before.build.journal);
    });

    it('blocks duplicate note IDs and non-existent note edits', () => {
      const session = new Session(freshState);
      const note = { id: 'note-1', date: '2026-11-06', text: 'Notes' };
      session.run(addSessionNote, { sessionNote: note });

      expect(session.preview(addSessionNote, { sessionNote: note })).toEqual({
        result: 'blocked',
        reasons: ['A session note with this id already exists'],
      });
      expect(
        session.preview(editSessionNote, {
          sessionNote: { id: 'note-2', date: '2026-11-06', text: 'Other' },
        }),
      ).toEqual({
        result: 'blocked',
        reasons: ['Session note does not exist'],
      });
      expect(session.preview(removeSessionNote, { sessionNoteId: 'note-2' })).toEqual({
        result: 'blocked',
        reasons: ['Session note does not exist'],
      });
    });
  });
});
