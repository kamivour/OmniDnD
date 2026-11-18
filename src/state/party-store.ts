import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import type { RemoteMember, JoinRequest } from '../sync/provider';

/** Members of the shared campaigns this device knows, kept from the last party sync. */
export interface PartyState {
  members: RemoteMember[];
  /** Last party sync problem, shown in Campaign Setup. Empty when fine. */
  error: string;
  requests: JoinRequest[];
  owners: Record<string, string>;
}

export const partyStore = createStore<PartyState>(() => ({
  members: [],
  error: '',
  requests: [],
  owners: {},
}));

export const usePartyState = (): PartyState =>
  useSyncExternalStore(partyStore.subscribe, partyStore.getState);

/** Members of one campaign, DM first. */
export function membersOf(members: readonly RemoteMember[], campaignId: string): RemoteMember[] {
  return members
    .filter((member) => member.campaignId === campaignId)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'dm' ? -1 : 1));
}

/** "DM: name" or "DM seat: empty" for a shared campaign; undefined before members load. */
export function dmLabel(members: readonly RemoteMember[], campaignId: string): string | undefined {
  const here = members.filter((member) => member.campaignId === campaignId);
  if (here.length === 0) return undefined;
  const dm = here.find((member) => member.role === 'dm');
  return dm ? `DM: ${dm.name || 'Unnamed player'}` : 'DM seat: empty';
}
