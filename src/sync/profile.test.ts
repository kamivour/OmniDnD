import { describe, expect, it } from 'vitest';
import { MemoryCloud, MemoryProvider } from './memory-provider';

describe('password help', () => {
  it('records reset requests and changes the password', async () => {
    const cloud = new MemoryCloud();
    const ana = new MemoryProvider(cloud);
    await ana.signUp('ana@example.com', 'password1');
    await ana.requestPasswordReset(' Ana@Example.com ', 'https://x/reset-password');
    expect(cloud.resetRequests).toEqual(['ana@example.com']);
    await expect(ana.updatePassword('short')).rejects.toThrow('8 characters');
    await ana.updatePassword('newpassword');
    const again = new MemoryProvider(cloud);
    expect((await again.signIn('ana@example.com', 'password1')).result).toBe('error');
    expect((await again.signIn('ana@example.com', 'newpassword')).result).toBe('ok');
  });
});

describe('delete account', () => {
  it('removes the account, its names and rows, and leaves other accounts alone', async () => {
    const cloud = new MemoryCloud();
    const ana = new MemoryProvider(cloud);
    const bo = new MemoryProvider(cloud);
    await ana.signUp('ana@example.com', 'password1');
    await bo.signUp('bo@example.com', 'password1');
    await ana.setDisplayName('Ana');
    const entity = {
      kind: 'campaign' as const,
      entityId: 'c1',
      deleted: false,
      changedAt: '2026-01-01T00:00:00Z',
      schemaVersion: 1,
      payload: {},
    };
    await ana.push(entity, null);
    await bo.push(entity, null);

    await ana.deleteAccount();
    expect(await ana.currentAccount()).toBeNull();
    expect((await new MemoryProvider(cloud).signIn('ana@example.com', 'password1')).result).toBe(
      'error',
    );
    expect(await bo.pull()).toHaveLength(1);
  });
});

describe('display name', () => {
  it('starts empty, saves trimmed, and is private to each account', async () => {
    const cloud = new MemoryCloud();
    const ana = new MemoryProvider(cloud);
    await ana.signUp('ana@example.com', 'password1');
    expect(await ana.getDisplayName()).toBeNull();
    await ana.setDisplayName('  Ana  ');
    expect(await ana.getDisplayName()).toBe('Ana');

    const bo = new MemoryProvider(cloud);
    await bo.signUp('bo@example.com', 'password1');
    expect(await bo.getDisplayName()).toBeNull();
  });

  it('rejects names outside 3 to 24 characters', async () => {
    const provider = new MemoryProvider(new MemoryCloud());
    await provider.signUp('ana@example.com', 'password1');
    await expect(provider.setDisplayName('  ab  ')).rejects.toThrow('3 to 24');
    await expect(provider.setDisplayName('x'.repeat(25))).rejects.toThrow('3 to 24');
  });

  it('keeps names unique ignoring case and reserves one at signup', async () => {
    const cloud = new MemoryCloud();
    const ana = new MemoryProvider(cloud);
    expect(await ana.signUp('ana@example.com', 'password1', ' Ana ')).toMatchObject({
      result: 'ok',
    });
    expect(await ana.getDisplayName()).toBe('Ana');
    // Your own name counts as available, so saving it again is fine.
    expect(await ana.displayNameAvailable('ANA')).toBe(true);
    await ana.setDisplayName('ana');

    const bo = new MemoryProvider(cloud);
    expect(await bo.displayNameAvailable(' ana ')).toBe(false);
    expect(await bo.signUp('bo@example.com', 'password1', 'ANA')).toEqual({
      result: 'error',
      message: 'That name is taken',
    });
    await bo.signUp('bo@example.com', 'password1', 'Bo the Bold');
    await expect(bo.setDisplayName('Ana')).rejects.toThrow('That name is taken');
  });
});

describe('profile picture', () => {
  const picture = `data:image/jpeg;base64,${'A'.repeat(100)}`;

  it('needs a name, accepts only small JPEG data URLs, and shows to party members', async () => {
    const cloud = new MemoryCloud();
    const ana = new MemoryProvider(cloud);
    const bo = new MemoryProvider(cloud);
    await ana.signUp('ana@example.com', 'password1');
    await bo.signUp('bo@example.com', 'password1');
    expect(await ana.getAvatar()).toBeNull();
    await expect(ana.setAvatar(picture)).rejects.toThrow('display name first');
    await ana.setDisplayName('Ana');
    await expect(ana.setAvatar('https://example.test/me.png')).rejects.toThrow('JPEG');
    await expect(ana.setAvatar(`data:image/jpeg;base64,${'A'.repeat(140_000)}`)).rejects.toThrow(
      'too large',
    );
    await ana.setAvatar(picture);
    expect(await ana.getAvatar()).toBe(picture);
    expect(await bo.getAvatar()).toBeNull();

    await ana.shareCampaign({
      id: 'c1',
      role: 'dm',
      changedAt: '2026-01-01T00:00:00Z',
      schemaVersion: 1,
      payload: {},
    });
    await bo.setDisplayName('Bodo');
    await bo.joinCampaign(await ana.createInvite('c1'));
    const members = (await bo.pullParty()).members;
    expect(members.find((member) => member.name === 'Ana')?.avatar).toBe(picture);
    expect(members.find((member) => member.name === 'Bodo')).not.toHaveProperty('avatar');

    await ana.setAvatar(null);
    expect(await ana.getAvatar()).toBeNull();
  });
});
