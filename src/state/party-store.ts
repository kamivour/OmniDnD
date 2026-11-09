import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import type { RemoteMember } from '../sync/provider';

/** Members of the shared campaigns this device knows, kept from the last party sync. */
export interface PartyState {
  members: RemoteMember[];
  /** Last party sync problem, shown in Campaign Setup. Empty when fine. */
  error: string;
}

export const partyStore = createStore<PartyState>(() => ({ members: [], error: '' }));

export const usePartyState = (): PartyState =>
  useSyncExternalStore(partyStore.subscribe, partyStore.getState);

/** Members of one campaign, DM first. */
export function membersOf(members: readonly RemoteMember[], campaignId: string): RemoteMember[] {
  return members
    .filter((member) => member.campaignId === campaignId)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'dm' ? -1 : 1));
}
