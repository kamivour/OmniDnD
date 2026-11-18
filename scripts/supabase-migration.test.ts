import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';

const folder = join(import.meta.dirname, '..', 'supabase', 'migrations');
const migration = readFileSync(join(folder, '20261117110000_join_requests.sql'), 'utf8');
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const player = '00000000-0000-4000-8000-000000000002';
const declined = '00000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  // Only Supabase's auth context is stubbed. PostgreSQL compiles every real migration,
  // and the authenticated role exercises the actual functions, grants and RLS policies.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
  `);
  for (const file of readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(join(folder, file), 'utf8'));
  await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [owner, player, declined]);
}, 30_000);

afterAll(async () => {
  await db.close();
});

async function asUser(id: string) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

it('applies the join-request migration twice without changing existing data', async () => {
  await db.query('insert into public.profiles(user_id, display_name) values ($1, $2)', [
    owner,
    'Preserved name',
  ]);
  await db.exec(migration);
  expect(
    (await db.query("select to_regclass('public.campaign_join_requests') as name")).rows,
  ).toEqual([{ name: 'campaign_join_requests' }]);
  expect((await db.query('select display_name from public.profiles')).rows).toEqual([
    { display_name: 'Preserved name' },
  ]);
});

it('approves and declines idempotently while enforcing membership and owner-only writes', async () => {
  await asUser(owner);
  await db.query("select public.share_campaign('table', 'dm', 1, now(), $1::jsonb)", [
    JSON.stringify({ name: 'Table' }),
  ]);
  await db.query(
    `insert into public.party_entities(campaign_id, entity_id, changed_at, schema_version, payload)
    values ('table', 'hero', now(), 1, $1::jsonb)`,
    [
      JSON.stringify({
        build: { journal: { notes: 'Private notes' } },
        live: { hp: 10 },
        events: [{ inversePatches: [{ value: 'Old private notes' }] }],
      }),
    ],
  );

  await asUser(player);
  await db.query("select public.request_campaign_join('table', 'existing', 'My bard')");
  expect((await db.query('select * from public.party_entities')).rows).toEqual([]);
  await expect(
    db.query("select public.resolve_campaign_join('table', $1, true)", [player]),
  ).rejects.toThrow('Only the owner or DM');

  await asUser(declined);
  await db.query("select public.request_campaign_join('table', '', 'No character selected')");
  expect((await db.query('select user_id from public.campaign_join_requests')).rows).toEqual([
    { user_id: declined },
  ]);

  await asUser(owner);
  await db.query("select public.resolve_campaign_join('table', $1, true)", [player]);
  await db.query("select public.resolve_campaign_join('table', $1, true)", [player]);
  await expect(
    db.query("select public.resolve_campaign_join('table', $1, false)", [player]),
  ).rejects.toThrow('already been reviewed');
  await db.query("select public.resolve_campaign_join('table', $1, false)", [declined]);
  await db.query("select public.resolve_campaign_join('table', $1, false)", [declined]);

  await asUser(player);
  expect((await db.query('select payload from public.party_entities')).rows).toEqual([
    { payload: { build: { journal: {} }, live: { hp: 10 }, events: [] } },
  ]);
  expect(
    (
      await db.query(
        'update public.party_entities set deleted = true, payload = null returning entity_id',
      )
    ).rows,
  ).toEqual([]);
  await expect(
    db.query("update public.campaign_join_requests set status = 'approved'"),
  ).rejects.toThrow('permission denied');
  await asUser(declined);
  expect((await db.query('select * from public.party_entities')).rows).toEqual([]);
});

it('joins with a seat, locks a taken DM seat and lets the DM step down', async () => {
  const third = '00000000-0000-4000-8000-000000000004';
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values ($1)', [third]);
  await db.query('insert into public.profiles(user_id, display_name) values ($1, $2)', [
    player,
    'Ana',
  ]);
  await asUser(owner);
  await db.query("select public.share_campaign('seat', 'player', 1, now(), $1::jsonb)", [
    JSON.stringify({ name: 'Seat' }),
  ]);
  const code = (await db.query<{ code: string }>("select public.create_invite('seat') as code"))
    .rows[0]!.code;
  const dms = async () =>
    (
      await db.query<{ user_id: string }>(
        "select user_id from public.campaign_members where campaign_id = 'seat' and role = 'dm'",
      )
    ).rows.map((row) => row.user_id);

  await asUser(player);
  await db.query('select public.join_campaign($1, $2)', [code, 'dm']);
  expect(await dms()).toEqual([player]);

  await asUser(third);
  const preview = await db.query<{ p: { has_dm: boolean; dm_name: string } }>(
    'select public.preview_invite($1) as p',
    [code],
  );
  expect(preview.rows[0]!.p).toMatchObject({ has_dm: true, dm_name: 'Ana' });
  await expect(db.query('select public.join_campaign($1, $2)', [code, 'dm'])).rejects.toThrow(
    'taken by Ana',
  );
  const inside = await db.query(
    "select 1 from public.campaign_members where campaign_id = 'seat' and user_id = $1",
    [third],
  );
  expect(inside.rows).toEqual([]);
  await db.query('select public.join_campaign($1, $2)', [code, 'player']);
  await expect(db.query("select public.claim_dm('seat')")).rejects.toThrow('taken by Ana');

  await asUser(player);
  await db.query("select public.release_dm('seat')");
  expect(await dms()).toEqual([]);
  await asUser(third);
  await db.query("select public.claim_dm('seat')");
  expect(await dms()).toEqual([third]);

  // Hand-over still works from the new DM.
  await db.query("select public.set_dm('seat', $1)", [player]);
  expect(await dms()).toEqual([player]);
  await expect(db.query("select public.claim_dm('other')")).rejects.toThrow('Join this campaign');
});

it('reserves unique display names at signup and checks them before sign-in', async () => {
  const [first, second] = [
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006',
  ];
  await db.exec('reset role');
  await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [
    first,
    JSON.stringify({ display_name: '  Rook  ' }),
  ]);
  expect(
    (await db.query('select display_name from public.profiles where user_id = $1', [first])).rows,
  ).toEqual([{ display_name: 'Rook' }]);
  // A taken name cancels the whole signup.
  await expect(
    db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [
      second,
      JSON.stringify({ display_name: 'ROOK' }),
    ]),
  ).rejects.toThrow('profiles_display_name_unique');
  expect((await db.query('select 1 from auth.users where id = $1', [second])).rows).toEqual([]);
  // Older clients send no name and get no profile.
  await db.query('insert into auth.users(id) values ($1)', [second]);

  await db.exec('set role anon');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  const free = async (name: string) =>
    (await db.query<{ ok: boolean }>('select public.display_name_available($1) as ok', [name]))
      .rows[0]!.ok;
  expect(await free(' rook ')).toBe(false);
  expect(await free('Rookie')).toBe(true);
  expect(await free('ab')).toBe(false);
  expect(await free('x'.repeat(25))).toBe(false);

  await asUser(first);
  expect(await free('ROOK')).toBe(true);
  await asUser(second);
  await expect(
    db.query("insert into public.profiles(user_id, display_name) values ($1, 'rook')", [second]),
  ).rejects.toThrow('profiles_display_name_unique');
  await expect(
    db.query("insert into public.profiles(user_id, display_name) values ($1, 'ab')", [second]),
  ).rejects.toThrow('profiles_display_name_shape');
  await db.query("insert into public.profiles(user_id, display_name) values ($1, 'Rookie')", [
    second,
  ]);
});

it('stops the name migration while two accounts share a name, renaming nobody', async () => {
  const fresh = new PGlite();
  try {
    await fresh.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    `);
    const files = readdirSync(folder)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const names = files.indexOf('20261119130000_display_names.sql');
    for (const file of files.slice(0, names))
      await fresh.exec(readFileSync(join(folder, file), 'utf8'));
    await fresh.query('insert into auth.users(id) values ($1), ($2)', [owner, player]);
    await fresh.query(
      "insert into public.profiles(user_id, display_name) values ($1, 'Kit'), ($2, 'kit ')",
      [owner, player],
    );
    await expect(fresh.exec(readFileSync(join(folder, files[names]!), 'utf8'))).rejects.toThrow(
      'used by more than one account: kit',
    );
    expect(
      (await fresh.query('select display_name from public.profiles order by display_name')).rows,
    ).toEqual([{ display_name: 'Kit' }, { display_name: 'kit ' }]);
  } finally {
    await fresh.close();
  }
}, 30_000);

it('keeps a small JPEG avatar that party members can see and nobody else can change', async () => {
  const picture = `data:image/jpeg;base64,${'A'.repeat(200)}`;
  await asUser(owner);
  await db.query('update public.profiles set avatar = $1 where user_id = $2', [picture, owner]);
  await expect(
    db.query(
      "update public.profiles set avatar = 'https://example.test/me.png' where user_id = $1",
      [owner],
    ),
  ).rejects.toThrow('profiles_avatar_shape');
  await expect(
    db.query('update public.profiles set avatar = $1 where user_id = $2', [
      `data:image/jpeg;base64,${'A'.repeat(140_000)}`,
      owner,
    ]),
  ).rejects.toThrow('profiles_avatar_shape');

  // A party member reads it but cannot overwrite it; an outsider sees nothing.
  await asUser(player);
  const seen = await db.query('select avatar from public.profiles where user_id = $1', [owner]);
  expect(seen.rows).toEqual([{ avatar: picture }]);
  const changed = await db.query(
    'update public.profiles set avatar = null where user_id = $1 returning user_id',
    [owner],
  );
  expect(changed.rows).toEqual([]);
  await asUser(declined);
  expect(
    (await db.query('select avatar from public.profiles where user_id = $1', [owner])).rows,
  ).toEqual([]);
});
