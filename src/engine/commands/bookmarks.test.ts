import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { BookmarkSchema, type Bookmark } from '../schema';
import { addBookmark, deleteBookmark, updateBookmark } from './bookmarks';
import {
  createCampaign,
  ManagementEventSchema,
  runManagement,
  undoManagement,
  validateManagementData,
  type ManagementCommand,
  type ManagementData,
} from './management';

const metadata = (eventId = 'm1') => ({ eventId, realTime: '2026-11-02T10:00:00.000Z' });
const bookmark: Bookmark = { id: 'rules', title: 'Rules', url: 'https://example.com/2014' };
const second: Bookmark = { id: 'sheet', title: 'Sheet', url: 'http://localhost:5173/sheet' };

function workspace(bookmarks: Bookmark[] = []): ManagementData {
  const file = structuredClone(seedFile);
  return {
    campaigns: { [file.campaign.id]: file.campaign },
    characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
    bookmarks: structuredClone(bookmarks),
  };
}

function run<P>(command: ManagementCommand<P>, state: ManagementData, payload: P, id = 'm1') {
  const result = runManagement(command, state, payload, registry, metadata(id));
  if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
  return result;
}

describe('bookmark schema', () => {
  it.each(['http://example.com/2014', 'https://example.com/2014', 'HTTPS://example.com/2014'])(
    'accepts HTTP(S) URLs and trims the title and address (%s)',
    (url) => {
      expect(BookmarkSchema.parse({ ...bookmark, title: '  Rules  ', url: `  ${url}  ` })).toEqual({
        ...bookmark,
        url,
      });
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/rules.html',
    'ftp://example.com/rules',
    'mailto:player@example.com',
    '//example.com/rules',
    '/rules',
    'example.com/rules',
    'https://',
    'not a URL',
    '',
  ])('rejects non-web or malformed URLs (%s)', (url) => {
    expect(BookmarkSchema.safeParse({ ...bookmark, url }).success).toBe(false);
  });
});

describe('bookmark management commands', () => {
  it('adds a canonical bookmark without mutating or retaining the payload and logs an undoable event', () => {
    const initial = workspace([second]);
    const before = structuredClone(initial);
    const payload = { bookmark: { ...bookmark, title: '  Rules  ', url: `  ${bookmark.url}  ` } };
    const input = structuredClone(payload);
    const { next, event, reasons } = run(addBookmark, initial, payload);
    expect(next.bookmarks).toEqual([second, bookmark]);
    expect(next.campaigns).toBe(initial.campaigns);
    expect(next.characters).toBe(initial.characters);
    expect(payload).toEqual(input);
    expect(initial).toEqual(before);
    payload.bookmark.title = 'Changed after dispatch';
    expect(next.bookmarks?.[1]).toEqual(bookmark);
    expect(reasons).toEqual([]);
    expect(event).toMatchObject({ command: 'addBookmark', text: 'Add bookmark: Rules' });
    expect(ManagementEventSchema.parse(event)).toEqual(event);
    expect(event.patches.every(({ path }) => path[0] === 'bookmarks')).toBe(true);
    const undone = undoManagement(next, [event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
    expect(undone.events[0]!.undoneBy).toBe('u1');
  });

  it('edits in place, retains bookmark identity and ordering, and undo restores the previous entry', () => {
    const third = { ...bookmark, id: 'other-rules', title: 'Other rules' };
    const initial = workspace([bookmark, second, third]);
    const before = structuredClone(initial);
    const { next, event } = run(updateBookmark, initial, {
      bookmark: { ...second, title: '  Character sheet  ', url: '  https://example.com/sheet  ' },
    });
    expect(next.bookmarks).toEqual([
      bookmark,
      { id: second.id, title: 'Character sheet', url: 'https://example.com/sheet' },
      third,
    ]);
    expect(next.bookmarks?.[0]).toBe(initial.bookmarks?.[0]);
    expect(next.bookmarks?.[2]).toBe(initial.bookmarks?.[2]);
    expect(next.campaigns).toBe(initial.campaigns);
    expect(next.characters).toBe(initial.characters);
    expect(event).toMatchObject({
      command: 'updateBookmark',
      text: 'Update bookmark: Character sheet',
    });
    expect(initial).toEqual(before);
    const undone = undoManagement(next, [event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
  });

  it('removes the requested entry and undo restores its exact position and content', () => {
    const third = { ...bookmark, id: 'other-rules', title: 'Other rules' };
    const initial = workspace([bookmark, second, third]);
    const before = structuredClone(initial);
    const { next, event } = run(deleteBookmark, initial, { bookmarkId: second.id });
    expect(next.bookmarks).toEqual([bookmark, third]);
    expect(next.campaigns).toBe(initial.campaigns);
    expect(next.characters).toBe(initial.characters);
    expect(event).toMatchObject({ command: 'deleteBookmark', text: 'Delete bookmark: Sheet' });
    expect(initial).toEqual(before);
    const undone = undoManagement(next, [event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
  });

  it('steps backward through add, edit, and remove without losing management history', () => {
    const initial = workspace();
    const added = run(addBookmark, initial, { bookmark }, 'add');
    const edited = run(
      updateBookmark,
      added.next,
      { bookmark: { ...bookmark, title: 'Basic Rules' } },
      'edit',
    );
    const removed = run(deleteBookmark, edited.next, { bookmarkId: bookmark.id }, 'remove');
    const restore = undoManagement(
      removed.next,
      [added.event, edited.event, removed.event],
      registry,
      metadata('u1'),
    );
    if (restore.result !== 'ok') throw new Error(restore.reasons.join());
    expect(restore.next).toEqual(edited.next);
    const unedit = undoManagement(restore.next, restore.events, registry, metadata('u2'));
    if (unedit.result !== 'ok') throw new Error(unedit.reasons.join());
    expect(unedit.next).toEqual(added.next);
    const unadd = undoManagement(unedit.next, unedit.events, registry, metadata('u3'));
    if (unadd.result !== 'ok') throw new Error(unadd.reasons.join());
    expect(unadd.next).toEqual(initial);
    expect(unadd.events.filter(({ undoneBy }) => undoneBy).map(({ id }) => id)).toEqual([
      'add',
      'edit',
      'remove',
    ]);
  });

  it('retains later character changes when undoing a bookmark', () => {
    const initial = workspace();
    const added = run(addBookmark, initial, { bookmark });
    const later = structuredClone(added.next);
    later.characters[seedFile.build.id]!.live.hp = 5;
    const undone = undoManagement(later, [added.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next.bookmarks).toEqual([]);
    expect(undone.next.characters).toBe(later.characters);
    expect(undone.next.characters[seedFile.build.id]!.live.hp).toBe(5);
    expect(undone.event.override).toBeUndefined();
  });

  it('retains bookmarks through unrelated management commands and their undo', () => {
    const initial = workspace([bookmark]);
    const created = run(createCampaign, initial, {
      campaign: { ...seedFile.campaign, id: 'new-campaign' },
    });
    expect(created.next.bookmarks).toBe(initial.bookmarks);
    const undone = undoManagement(created.next, [created.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(initial);
    expect(undone.next.bookmarks).toBe(initial.bookmarks);
  });

  it('preserves legacy callers without a bookmarks property through management run and undo', () => {
    const initial: ManagementData = { campaigns: {}, characters: {} };
    const created = run(createCampaign, initial, { campaign: seedFile.campaign });
    expect(created.next).not.toHaveProperty('bookmarks');
    const undone = undoManagement(created.next, [created.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(initial);
    const added = run(addBookmark, initial, { bookmark });
    expect(added.next.bookmarks).toEqual([bookmark]);
    const unadd = undoManagement(added.next, [added.event], registry, metadata('u2'));
    if (unadd.result !== 'ok') throw new Error(unadd.reasons.join());
    expect(unadd.next).toEqual(initial);
    expect(unadd.next).not.toHaveProperty('bookmarks');
  });

  const invalidPayloads = [
    null,
    [],
    {},
    { bookmark: null },
    { bookmark: { ...bookmark, id: '' } },
    { bookmark: { ...bookmark, id: '  ' } },
    { bookmark: { ...bookmark, id: 1 } },
    { bookmark: { ...bookmark, title: '  ' } },
    { bookmark: { ...bookmark, title: false } },
    { bookmark: { ...bookmark, url: 12 } },
    { bookmark: { ...bookmark, url: 'javascript:alert(1)' } },
    { bookmark: { ...bookmark, url: 'data:text/html,hello' } },
    { bookmark: { ...bookmark, url: 'file:///C:/rules.html' } },
    { bookmark: { ...bookmark, url: 'https://' } },
    { bookmark: { ...bookmark, extra: true } },
    { bookmark, extra: true },
  ];

  describe.each([addBookmark, updateBookmark])('$name strict validation', (command) => {
    it.each(invalidPayloads)('blocks malformed payloads even when forced (%j)', (payload) => {
      const initial = workspace([bookmark]);
      const before = structuredClone(initial);
      const result = runManagement(command, initial, payload as { bookmark: Bookmark }, registry, {
        ...metadata(),
        force: true,
      });
      expect(result.result).toBe('blocked');
      expect(initial).toEqual(before);
    });
  });

  it('blocks duplicate additions and missing updates without mutation, including attempts to change identity', () => {
    const initial = workspace([bookmark]);
    const before = structuredClone(initial);
    for (const [command, entry] of [
      [addBookmark, { ...bookmark, title: 'Duplicate' }],
      [updateBookmark, { ...bookmark, id: 'renamed-id' }],
    ] as const) {
      expect(
        runManagement(command, initial, { bookmark: entry }, registry, {
          ...metadata(),
          force: true,
        }).result,
      ).toBe('blocked');
    }
    expect(initial).toEqual(before);
  });

  it.each([
    null,
    {},
    [],
    { bookmarkId: '' },
    { bookmarkId: ' ' },
    { bookmarkId: 1 },
    { bookmarkId: 'missing' },
    { bookmarkId: bookmark.id, extra: true },
  ])('blocks invalid and missing deletions even when forced (%j)', (payload) => {
    const initial = workspace([bookmark]);
    const before = structuredClone(initial);
    expect(
      runManagement(deleteBookmark, initial, payload as { bookmarkId: string }, registry, {
        ...metadata(),
        force: true,
      }).result,
    ).toBe('blocked');
    expect(initial).toEqual(before);
  });

  it('validates bookmark records and unique IDs when present, while accepting old workspaces', () => {
    expect(() => validateManagementData({ campaigns: {}, characters: {} }, registry)).not.toThrow();
    expect(() => validateManagementData(workspace([bookmark, second]), registry)).not.toThrow();
    expect(() => validateManagementData(workspace([bookmark, { ...bookmark }]), registry)).toThrow(
      'Duplicate bookmark id',
    );
    for (const bookmarks of [
      undefined,
      {},
      [{ ...bookmark, url: 'javascript:alert(1)' }],
      [{ ...bookmark, extra: true }],
    ]) {
      expect(() =>
        validateManagementData(
          { campaigns: {}, characters: {}, bookmarks } as ManagementData,
          registry,
        ),
      ).toThrow();
    }
  });

  it('blocks a tampered undo that would restore an unsafe address', () => {
    const removed = run(deleteBookmark, workspace([bookmark]), { bookmarkId: bookmark.id });
    const invalid = {
      ...removed.event,
      inversePatches: [
        {
          op: 'add' as const,
          path: ['bookmarks', 0],
          value: { ...bookmark, url: 'javascript:alert(1)' },
        },
      ],
    };
    const before = structuredClone(removed.next);
    expect(undoManagement(removed.next, [invalid], registry, metadata('u1'), true).result).toBe(
      'blocked',
    );
    expect(removed.next).toEqual(before);
  });
});
