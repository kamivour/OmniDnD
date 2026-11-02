import { useParams } from 'react-router';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';

/** Preserve the M1 seed URL while using the saved campaign's canonical ID. */
export function useCampaign() {
  const { campaignId = '' } = useParams();
  return useStore(characterStore, (state) => {
    if (Object.hasOwn(state.campaigns, campaignId)) return state.campaigns[campaignId];
    return campaignId === '273' && Object.hasOwn(state.campaigns, 'campaign-273')
      ? state.campaigns['campaign-273']
      : undefined;
  });
}
