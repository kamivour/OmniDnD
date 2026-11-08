/** The half-finished New character form, kept for this tab so a reload does not lose it. */
export interface Draft {
  name?: string;
  raceId?: string;
  classId?: string;
  backgroundId?: string;
  alignment?: string;
  racialChoices?: string[];
  level?: number;
  bases?: Record<string, string>;
  rolls?: string[];
  guided?: boolean;
  guidedState?: unknown;
  mode?: 'steps' | 'page';
  stepIndex?: number;
  levelPicks?: unknown;
}

const key = (campaignId: string) => `omni.newCharacterDraft.${campaignId}`;

export function loadDraft(campaignId: string): Draft | undefined {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key(campaignId)) ?? 'null');
    return parsed && typeof parsed === 'object' ? (parsed as Draft) : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(campaignId: string, draft: Draft) {
  try {
    sessionStorage.setItem(key(campaignId), JSON.stringify(draft));
  } catch {
    // Storage may be blocked; the form still works without a draft.
  }
}

export function clearDraft(campaignId: string) {
  try {
    sessionStorage.removeItem(key(campaignId));
  } catch {
    // Nothing to clear.
  }
}
