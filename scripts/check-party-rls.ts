// Live check of the shared-campaign rules against a THROWAWAY Supabase project (M24).
// Never point this at the real project: it creates three accounts and campaign rows.
//
//   SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... npm run check:party
//
// The throwaway project needs the migrations applied and "Confirm email" switched off.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_ANON_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY (throwaway project only).');
  process.exit(2);
}

const run = Date.now().toString(36);
const campaignId = `rls-${run}`;
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`,
  );
}

async function account(label: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(url!, key!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({
    email: `${label}-${run}@example.test`,
    password: `pw-${run}-${label}-Aa1!`,
  });
  if (error || !data.user || !data.session)
    throw new Error(
      `Sign-up failed for ${label}: ${error?.message ?? 'no session (is email confirmation off?)'}`,
    );
  const named = await client.from('profiles').insert({ display_name: label });
  if (named.error) throw new Error(`Profile failed for ${label}: ${named.error.message}`);
  return { client, id: data.user.id };
}

const character = (name: string) => ({ build: { id: name, name }, live: {}, events: [] });
const entity = (campaign: string, id: string, name: string) => ({
  campaign_id: campaign,
  entity_id: id,
  changed_at: new Date().toISOString(),
  schema_version: 1,
  payload: character(name),
});

const dm = await account('dm');
const ana = await account('ana');
const ben = await account('ben');
const outsider = await account('outsider');

// Share and invite.
const shared = await dm.client.rpc('share_campaign', {
  p_id: campaignId,
  p_role: 'dm',
  p_schema_version: 1,
  p_changed_at: new Date().toISOString(),
  p_payload: { id: campaignId, name: 'RLS test' },
});
check('owner can share a campaign', !shared.error, shared.error);

const invite = await dm.client.rpc('create_invite', { p_campaign: campaignId });
check('owner can create an invite', typeof invite.data === 'string', invite.error);
const code = String(invite.data);
check(
  'a player cannot create an invite',
  !!(await ana.client.rpc('create_invite', { p_campaign: campaignId })).error,
);

check(
  'an outsider cannot read the invite table',
  ((await outsider.client.from('campaign_invites').select('*')).data ?? []).length === 0,
);
check(
  'a wrong code is refused',
  !!(await ana.client.rpc('join_campaign', { p_code: 'NOTACODE0000' })).error,
);

const joined = await ana.client.rpc('join_campaign', { p_code: code });
check('a player joins with the code', joined.data === campaignId, joined.error);
check(
  'a second player joins with the same code',
  !(await ben.client.rpc('join_campaign', { p_code: code })).error,
);

// Reading.
const outsiderSees = await outsider.client.from('shared_campaigns').select('id');
check('a non-member sees no campaign', (outsiderSees.data ?? []).length === 0, outsiderSees);
const members = await ana.client.from('campaign_members').select('user_id, role');
check('a member sees the member list', (members.data ?? []).length === 3, members);
const names = await ana.client.from('profiles').select('display_name');
check(
  'a member reads party names',
  (names.data ?? []).some((row) => row.display_name === 'dm'),
  names,
);
check(
  'a non-member cannot read party names',
  ((await outsider.client.from('profiles').select('display_name').eq('user_id', dm.id)).data ?? [])
    .length === 0,
);

// Characters.
const added = await ana.client.from('party_entities').insert(entity(campaignId, 'ana-1', 'Ana'));
check('a member adds their own character', !added.error, added.error);
check(
  'a member cannot add a character as someone else',
  !!(
    await ben.client
      .from('party_entities')
      .insert({ ...entity(campaignId, 'ben-x', 'Fake'), owner_id: ana.id })
  ).error,
);
check(
  'a non-member cannot add a character',
  !!(await outsider.client.from('party_entities').insert(entity(campaignId, 'out-1', 'Out'))).error,
);

const seen = await ben.client.from('party_entities').select('entity_id');
check('another player reads the character', (seen.data ?? []).length === 1, seen);
const dmSeen = await dm.client.from('party_entities').select('entity_id');
check('the DM reads the character', (dmSeen.data ?? []).length === 1, dmSeen);
check(
  'a non-member reads no characters',
  ((await outsider.client.from('party_entities').select('entity_id')).data ?? []).length === 0,
);

async function changes(who: SupabaseClient) {
  const result = await who
    .from('party_entities')
    .update({ payload: character('Edited'), changed_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('entity_id', 'ana-1')
    .select('revision');
  return result.data?.length ?? 0;
}
check('another player cannot change the character', (await changes(ben.client)) === 0);
check('the DM cannot change the character (D175)', (await changes(dm.client)) === 0);
check('the owner can change the character', (await changes(ana.client)) === 1);

// Campaign record.
async function renames(who: SupabaseClient) {
  const result = await who
    .from('shared_campaigns')
    .update({ payload: { id: campaignId, name: 'Renamed' } })
    .eq('id', campaignId)
    .select('id');
  return result.data?.length ?? 0;
}
check('a player cannot change the campaign record', (await renames(ana.client)) === 0);
check('the DM can change the campaign record', (await renames(dm.client)) === 1);

// Members.
check(
  'a player cannot remove a member',
  !!(await ana.client.rpc('remove_member', { p_campaign: campaignId, p_user: ben.id })).error,
);
check(
  'a player cannot take the DM role',
  !!(await ana.client.rpc('set_dm', { p_campaign: campaignId, p_user: ana.id })).error,
);
check(
  'direct member inserts are refused',
  !!(
    await outsider.client
      .from('campaign_members')
      .insert({ campaign_id: campaignId, user_id: outsider.id, role: 'player' })
  ).error,
);
const handed = await dm.client.rpc('set_dm', { p_campaign: campaignId, p_user: ana.id });
check('the DM hands over the DM role', !handed.error, handed.error);
const roles = await ana.client.from('campaign_members').select('role');
check(
  'there is still exactly one DM',
  (roles.data ?? []).filter((row) => row.role === 'dm').length === 1,
  roles,
);
check(
  'the new DM removes a member',
  !(await ana.client.rpc('remove_member', { p_campaign: campaignId, p_user: ben.id })).error,
);
check(
  'a removed member no longer sees the party',
  ((await ben.client.from('party_entities').select('entity_id')).data ?? []).length === 0,
);
check(
  'a member can leave',
  !(await ana.client.rpc('leave_campaign', { p_campaign: campaignId })).error,
);

// Clean up through account deletion (cascades to every row above).
for (const who of [dm, ana, ben, outsider]) await who.client.rpc('delete_my_account');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
