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

  it('rejects empty and over-long names', async () => {
    const provider = new MemoryProvider(new MemoryCloud());
    await provider.signUp('ana@example.com', 'password1');
    await expect(provider.setDisplayName('   ')).rejects.toThrow('1 to 40');
    await expect(provider.setDisplayName('x'.repeat(41))).rejects.toThrow('1 to 40');
  });
});
