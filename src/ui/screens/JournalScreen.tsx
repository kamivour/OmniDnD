import { useState } from 'react';
import { Check, MapPin, Plus, User, Calendar, Edit2, Trash2 } from 'lucide-react';
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
} from '../../engine/commands/journal';
import type { LocationEntry, Npc, Quest, SessionNote } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { cx } from '../cx';
import { useCharacter } from '../hooks/useCharacter';

type Tab = 'story' | 'quests' | 'world' | 'notes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'story', label: 'Story & Traits' },
  { id: 'quests', label: 'Quests' },
  { id: 'world', label: 'NPCs & Locations' },
  { id: 'notes', label: 'Session Log' },
];

export function JournalScreen() {
  const { state } = useCharacter();
  const [tab, setTab] = useState<Tab>('story');

  const journal = state.build.journal;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl text-text">Journal</h1>
          <p className="text-xs text-text-muted">
            Backstory, personality, quests, notes and table memories.
          </p>
        </div>

        <nav aria-label="Journal sections" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cx(
                'min-h-11 rounded-btn px-3 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-accent text-bg'
                  : 'bg-surface text-text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'story' && <StoryTab journal={journal} />}
      {tab === 'quests' && <QuestsTab quests={journal.quests ?? []} />}
      {tab === 'world' && (
        <WorldTab npcs={journal.npcs ?? []} locations={journal.locations ?? []} />
      )}
      {tab === 'notes' && <SessionNotesTab notes={journal.sessionNotes ?? []} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story & Traits Tab
// ---------------------------------------------------------------------------

function StoryTab({
  journal,
}: {
  journal: ReturnType<typeof useCharacter>['state']['build']['journal'];
}) {
  const { run } = useCommand();
  const [editing, setEditing] = useState(false);

  const [personality, setPersonality] = useState(journal.personality ?? '');
  const [ideals, setIdeals] = useState(journal.ideals ?? '');
  const [bonds, setBonds] = useState(journal.bonds ?? '');
  const [flaws, setFlaws] = useState(journal.flaws ?? '');
  const [relationships, setRelationships] = useState(journal.relationships ?? '');
  const [backstory, setBackstory] = useState(journal.backstory ?? '');
  const [notes, setNotes] = useState(journal.notes ?? '');

  const openEditor = () => {
    setPersonality(journal.personality ?? '');
    setIdeals(journal.ideals ?? '');
    setBonds(journal.bonds ?? '');
    setFlaws(journal.flaws ?? '');
    setRelationships(journal.relationships ?? '');
    setBackstory(journal.backstory ?? '');
    setNotes(journal.notes ?? '');
    setEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    run(updateJournalNarrative, {
      personality: personality.trim() || undefined,
      ideals: ideals.trim() || undefined,
      bonds: bonds.trim() || undefined,
      flaws: flaws.trim() || undefined,
      relationships: relationships.trim() || undefined,
      backstory: backstory.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2"
        >
          <Edit2 size={16} aria-hidden />
          Edit story &amp; traits
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TraitCard title="Personality Traits" text={journal.personality} />
        <TraitCard title="Ideals" text={journal.ideals} />
        <TraitCard title="Bonds" text={journal.bonds} />
        <TraitCard title="Flaws" text={journal.flaws} />
      </div>

      {journal.relationships && (
        <TraitCard title="Relationships &amp; Allies" text={journal.relationships} />
      )}

      <TraitCard title="Backstory" text={journal.backstory} />

      {journal.appearance && Object.keys(journal.appearance).length > 0 && (
        <section
          aria-labelledby="appearance-heading"
          className="rounded-card border border-border bg-surface p-4"
        >
          <h2 id="appearance-heading" className="mb-3 text-sm font-semibold text-text">
            Appearance
          </h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(journal.appearance).map(([key, val]) => (
              <div key={key} className="flex flex-col">
                <dt className="text-xs capitalize text-text-muted">{key}</dt>
                <dd className="text-sm font-medium text-text">{val}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <TraitCard title="Freeform Notes" text={journal.notes} placeholder="No general notes yet." />

      <Sheet
        open={editing}
        onOpenChange={setEditing}
        title="Edit story & traits"
        description="Update character personality, backstory and notes."
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Personality Traits" htmlFor="journal-personality">
            <textarea
              id="journal-personality"
              rows={2}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Ideals" htmlFor="journal-ideals">
            <textarea
              id="journal-ideals"
              rows={2}
              value={ideals}
              onChange={(e) => setIdeals(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Bonds" htmlFor="journal-bonds">
            <textarea
              id="journal-bonds"
              rows={2}
              value={bonds}
              onChange={(e) => setBonds(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Flaws" htmlFor="journal-flaws">
            <textarea
              id="journal-flaws"
              rows={2}
              value={flaws}
              onChange={(e) => setFlaws(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Relationships" htmlFor="journal-relationships">
            <textarea
              id="journal-relationships"
              rows={2}
              value={relationships}
              onChange={(e) => setRelationships(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Backstory" htmlFor="journal-backstory">
            <textarea
              id="journal-backstory"
              rows={4}
              value={backstory}
              onChange={(e) => setBackstory(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="General Notes" htmlFor="journal-notes">
            <textarea
              id="journal-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 rounded-btn px-4 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg"
            >
              Save story
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

function TraitCard({
  title,
  text,
  placeholder = 'None recorded.',
}: {
  title: string;
  text?: string;
  placeholder?: string;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
      <p className="whitespace-pre-line text-sm text-text wrap-anywhere">
        {text ? text : <span className="italic text-text-muted">{placeholder}</span>}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quests Tab
// ---------------------------------------------------------------------------

function QuestsTab({ quests }: { quests: Quest[] }) {
  const { run } = useCommand();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const [notes, setNotes] = useState('');

  const openCreate = () => {
    setEditingQuest(null);
    setTitle('');
    setStatus('open');
    setNotes('');
    setEditorOpen(true);
  };

  const openEdit = (quest: Quest) => {
    setEditingQuest(quest);
    setTitle(quest.title);
    setStatus(quest.status);
    setNotes(quest.notes ?? '');
    setEditorOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingQuest) {
      run(editQuest, {
        quest: {
          id: editingQuest.id,
          title: title.trim(),
          status,
          notes: notes.trim() || undefined,
        },
      });
    } else {
      run(addQuest, {
        quest: {
          id: crypto.randomUUID(),
          title: title.trim(),
          status,
          notes: notes.trim() || undefined,
        },
      });
    }
    setEditorOpen(false);
  };

  const toggleStatus = (quest: Quest) => {
    run(editQuest, {
      quest: {
        ...quest,
        status: quest.status === 'open' ? 'done' : 'open',
      },
    });
  };

  const openQuests = quests.filter((q) => q.status === 'open');
  const doneQuests = quests.filter((q) => q.status === 'done');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {openQuests.length} open · {doneQuests.length} completed
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn bg-accent px-4 text-sm font-semibold text-bg hover:opacity-90"
        >
          <Plus size={16} aria-hidden />
          Add quest
        </button>
      </div>

      <section aria-labelledby="open-quests-heading" className="flex flex-col gap-3">
        <h2 id="open-quests-heading" className="text-sm font-semibold text-text">
          Open Quests ({openQuests.length})
        </h2>
        {openQuests.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-sm text-text-muted">
            No active quests.
          </p>
        ) : (
          openQuests.map((q) => (
            <QuestRow
              key={q.id}
              quest={q}
              onToggle={() => toggleStatus(q)}
              onEdit={() => openEdit(q)}
              onDelete={() => run(removeQuest, { questId: q.id })}
            />
          ))
        )}
      </section>

      {doneQuests.length > 0 && (
        <section aria-labelledby="done-quests-heading" className="flex flex-col gap-3">
          <h2 id="done-quests-heading" className="text-sm font-semibold text-text-muted">
            Completed Quests ({doneQuests.length})
          </h2>
          {doneQuests.map((q) => (
            <QuestRow
              key={q.id}
              quest={q}
              onToggle={() => toggleStatus(q)}
              onEdit={() => openEdit(q)}
              onDelete={() => run(removeQuest, { questId: q.id })}
            />
          ))}
        </section>
      )}

      <Sheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingQuest ? 'Edit quest' : 'New quest'}
        description="Track party objectives, rumors and tasks."
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Title" htmlFor="quest-title">
            <input
              id="quest-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Find the Sunken Temple"
              className={inputClass}
            />
          </Field>

          <Field label="Status" htmlFor="quest-status">
            <select
              id="quest-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'open' | 'done')}
              className={inputClass}
            >
              <option value="open">Open</option>
              <option value="done">Completed</option>
            </select>
          </Field>

          <Field label="Notes" htmlFor="quest-notes">
            <textarea
              id="quest-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Clues, NPCs, locations involved..."
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="min-h-11 rounded-btn px-4 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
            >
              {editingQuest ? 'Save' : 'Add quest'}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

function QuestRow({
  quest,
  onToggle,
  onEdit,
  onDelete,
}: {
  quest: Quest;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = quest.status === 'done';
  return (
    <article
      aria-label={quest.title}
      className={cx(
        'flex items-start justify-between gap-3 rounded-card border p-3 transition-colors',
        isDone ? 'border-border/60 bg-surface/50 opacity-75' : 'border-border bg-surface',
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggle}
          aria-label={isDone ? `Reopen quest: ${quest.title}` : `Complete quest: ${quest.title}`}
          className={cx(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-btn border transition-colors',
            isDone ? 'border-heal bg-heal text-bg' : 'border-border hover:border-accent',
          )}
        >
          {isDone && <Check size={14} aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <h3
            className={cx(
              'text-sm font-semibold wrap-anywhere',
              isDone ? 'line-through text-text-muted' : 'text-text',
            )}
          >
            {quest.title}
          </h3>
          {quest.notes && (
            <p className="mt-1 whitespace-pre-line text-xs text-text-muted wrap-anywhere">
              {quest.notes}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit quest: ${quest.title}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-text"
        >
          <Edit2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete quest: ${quest.title}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-danger"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// World Tab (NPCs & Locations)
// ---------------------------------------------------------------------------

function WorldTab({ npcs, locations }: { npcs: Npc[]; locations: LocationEntry[] }) {
  const { run } = useCommand();

  const [npcOpen, setNpcOpen] = useState(false);
  const [editingNpcItem, setEditingNpcItem] = useState<Npc | null>(null);
  const [npcName, setNpcName] = useState('');
  const [npcRel, setNpcRel] = useState('');
  const [npcLoc, setNpcLoc] = useState('');
  const [npcNotes, setNpcNotes] = useState('');

  const [locOpen, setLocOpen] = useState(false);
  const [editingLocItem, setEditingLocItem] = useState<LocationEntry | null>(null);
  const [locName, setLocName] = useState('');
  const [locNotes, setLocNotes] = useState('');

  const openCreateNpc = () => {
    setEditingNpcItem(null);
    setNpcName('');
    setNpcRel('');
    setNpcLoc('');
    setNpcNotes('');
    setNpcOpen(true);
  };

  const openEditNpc = (npc: Npc) => {
    setEditingNpcItem(npc);
    setNpcName(npc.name);
    setNpcRel(npc.relationship ?? '');
    setNpcLoc(npc.location ?? '');
    setNpcNotes(npc.notes ?? '');
    setNpcOpen(true);
  };

  const handleSaveNpc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!npcName.trim()) return;
    const payload = {
      id: editingNpcItem ? editingNpcItem.id : crypto.randomUUID(),
      name: npcName.trim(),
      relationship: npcRel.trim() || undefined,
      location: npcLoc.trim() || undefined,
      notes: npcNotes.trim() || undefined,
    };
    if (editingNpcItem) run(editNpc, { npc: payload });
    else run(addNpc, { npc: payload });
    setNpcOpen(false);
  };

  const openCreateLoc = () => {
    setEditingLocItem(null);
    setLocName('');
    setLocNotes('');
    setLocOpen(true);
  };

  const openEditLoc = (loc: LocationEntry) => {
    setEditingLocItem(loc);
    setLocName(loc.name);
    setLocNotes(loc.notes ?? '');
    setLocOpen(true);
  };

  const handleSaveLoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) return;
    const payload = {
      id: editingLocItem ? editingLocItem.id : crypto.randomUUID(),
      name: locName.trim(),
      notes: locNotes.trim() || undefined,
    };
    if (editingLocItem) run(editLocation, { location: payload });
    else run(addLocation, { location: payload });
    setLocOpen(false);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* NPCs Section */}
      <section aria-labelledby="npcs-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2
            id="npcs-heading"
            className="flex items-center gap-2 text-base font-semibold text-text"
          >
            <User size={18} aria-hidden className="text-accent" />
            NPCs &amp; Contacts ({npcs.length})
          </h2>
          <button
            type="button"
            onClick={openCreateNpc}
            className="inline-flex min-h-11 items-center gap-2 rounded-btn bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2"
          >
            <Plus size={16} aria-hidden />
            Add NPC
          </button>
        </div>

        {npcs.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-sm text-text-muted">
            No NPCs recorded yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {npcs.map((npc) => (
              <article
                key={npc.id}
                aria-label={npc.name}
                className="flex flex-col justify-between rounded-card border border-border bg-surface p-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-text wrap-anywhere">{npc.name}</h3>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => openEditNpc(npc)}
                        aria-label={`Edit NPC: ${npc.name}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-text"
                      >
                        <Edit2 size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(removeNpc, { npcId: npc.id })}
                        aria-label={`Delete NPC: ${npc.name}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-danger"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  </div>

                  {(npc.relationship || npc.location) && (
                    <div className="mb-2 flex flex-wrap gap-2 text-xs text-text-muted">
                      {npc.relationship && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">
                          {npc.relationship}
                        </span>
                      )}
                      {npc.location && (
                        <span className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5">
                          <MapPin size={12} aria-hidden />
                          {npc.location}
                        </span>
                      )}
                    </div>
                  )}

                  {npc.notes && (
                    <p className="whitespace-pre-line text-xs text-text-muted wrap-anywhere">
                      {npc.notes}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Locations Section */}
      <section aria-labelledby="locations-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2
            id="locations-heading"
            className="flex items-center gap-2 text-base font-semibold text-text"
          >
            <MapPin size={18} aria-hidden className="text-accent" />
            Locations &amp; Landmarks ({locations.length})
          </h2>
          <button
            type="button"
            onClick={openCreateLoc}
            className="inline-flex min-h-11 items-center gap-2 rounded-btn bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2"
          >
            <Plus size={16} aria-hidden />
            Add location
          </button>
        </div>

        {locations.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-sm text-text-muted">
            No locations recorded yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {locations.map((loc) => (
              <article
                key={loc.id}
                aria-label={loc.name}
                className="flex flex-col justify-between rounded-card border border-border bg-surface p-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-text wrap-anywhere">{loc.name}</h3>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => openEditLoc(loc)}
                        aria-label={`Edit location: ${loc.name}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-text"
                      >
                        <Edit2 size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(removeLocation, { locationId: loc.id })}
                        aria-label={`Delete location: ${loc.name}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-danger"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  </div>

                  {loc.notes && (
                    <p className="mt-1 whitespace-pre-line text-xs text-text-muted wrap-anywhere">
                      {loc.notes}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* NPC Modal */}
      <Sheet
        open={npcOpen}
        onOpenChange={setNpcOpen}
        title={editingNpcItem ? 'Edit NPC' : 'New NPC'}
        description="Record key characters, allies and adversaries."
      >
        <form onSubmit={handleSaveNpc} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="npc-name">
            <input
              id="npc-name"
              required
              value={npcName}
              onChange={(e) => setNpcName(e.target.value)}
              placeholder="e.g. Sildar Hallwinter"
              className={inputClass}
            />
          </Field>
          <Field
            label="Relationship"
            htmlFor="npc-relationship"
            hint="Allied, enemy, merchant, patron..."
          >
            <input
              id="npc-relationship"
              value={npcRel}
              onChange={(e) => setNpcRel(e.target.value)}
              placeholder="e.g. Lords' Alliance Contact"
              className={inputClass}
            />
          </Field>
          <Field label="Location" htmlFor="npc-location">
            <input
              id="npc-location"
              value={npcLoc}
              onChange={(e) => setNpcLoc(e.target.value)}
              placeholder="e.g. Townmaster's Hall, Phandalin"
              className={inputClass}
            />
          </Field>
          <Field label="Notes" htmlFor="npc-notes">
            <textarea
              id="npc-notes"
              rows={3}
              value={npcNotes}
              onChange={(e) => setNpcNotes(e.target.value)}
              placeholder="Description, quest connections, secrets..."
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setNpcOpen(false)}
              className="min-h-11 rounded-btn px-4 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!npcName.trim()}
              className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
            >
              {editingNpcItem ? 'Save' : 'Add NPC'}
            </button>
          </div>
        </form>
      </Sheet>

      {/* Location Modal */}
      <Sheet
        open={locOpen}
        onOpenChange={setLocOpen}
        title={editingLocItem ? 'Edit location' : 'New location'}
        description="Record places, towns, taverns and ruins."
      >
        <form onSubmit={handleSaveLoc} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="loc-name">
            <input
              id="loc-name"
              required
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              placeholder="e.g. Stonehill Inn"
              className={inputClass}
            />
          </Field>
          <Field label="Notes" htmlFor="loc-notes">
            <textarea
              id="loc-notes"
              rows={3}
              value={locNotes}
              onChange={(e) => setLocNotes(e.target.value)}
              placeholder="Atmosphere, key people, rooms..."
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setLocOpen(false)}
              className="min-h-11 rounded-btn px-4 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!locName.trim()}
              className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
            >
              {editingLocItem ? 'Save' : 'Add location'}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session Notes Tab
// ---------------------------------------------------------------------------

function SessionNotesTab({ notes }: { notes: SessionNote[] }) {
  const { run } = useCommand();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SessionNote | null>(null);

  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const openCreate = () => {
    setEditingNote(null);
    setDate(new Date().toISOString().slice(0, 10));
    setTitle('');
    setText('');
    setEditorOpen(true);
  };

  const openEdit = (note: SessionNote) => {
    setEditingNote(note);
    setDate(note.date);
    setTitle(note.title ?? '');
    setText(note.text);
    setEditorOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date.trim() || !text.trim()) return;

    if (editingNote) {
      run(editSessionNote, {
        sessionNote: {
          id: editingNote.id,
          date: date.trim(),
          title: title.trim() || undefined,
          text: text.trim(),
        },
      });
    } else {
      run(addSessionNote, {
        sessionNote: {
          id: crypto.randomUUID(),
          date: date.trim(),
          title: title.trim() || undefined,
          text: text.trim(),
        },
      });
    }
    setEditorOpen(false);
  };

  // Sort notes by date descending
  const sortedNotes = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{notes.length} session entries</p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn bg-accent px-4 text-sm font-semibold text-bg hover:opacity-90"
        >
          <Plus size={16} aria-hidden />
          Add session note
        </button>
      </div>

      {sortedNotes.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-4 text-sm text-text-muted">
          No session notes recorded yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedNotes.map((note) => (
            <article
              key={note.id}
              aria-label={note.title || note.date}
              className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-xs font-semibold text-accent">
                    <Calendar size={12} aria-hidden />
                    {note.date}
                  </span>
                  {note.title && (
                    <h3 className="font-semibold text-text wrap-anywhere">{note.title}</h3>
                  )}
                </div>

                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => openEdit(note)}
                    aria-label={`Edit note: ${note.title || note.date}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-text"
                  >
                    <Edit2 size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => run(removeSessionNote, { sessionNoteId: note.id })}
                    aria-label={`Delete note: ${note.title || note.date}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:text-danger"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>

              <p className="whitespace-pre-line text-sm text-text wrap-anywhere">{note.text}</p>
            </article>
          ))}
        </div>
      )}

      <Sheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingNote ? 'Edit session note' : 'New session note'}
        description="Recap events, loot, rulings and milestones."
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Date" htmlFor="note-date">
            <input
              id="note-date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="YYYY-MM-DD or session day"
              className={inputClass}
            />
          </Field>

          <Field label="Title" htmlFor="note-title" hint="Optional summary">
            <input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Session 4: Castle Cragmaw Infiltration"
              className={inputClass}
            />
          </Field>

          <Field label="Notes" htmlFor="note-text">
            <textarea
              id="note-text"
              required
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What happened in the session..."
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="min-h-11 rounded-btn px-4 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!date.trim() || !text.trim()}
              className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
            >
              {editingNote ? 'Save' : 'Add session note'}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
