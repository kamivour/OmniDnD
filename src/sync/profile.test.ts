import { describe, expect, it } from 'vitest';
import { MemoryCloud, MemoryProvider } from './memory-provider';

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
