import { describe,it,expect } from 'vitest';
import { entryAccess } from '../server/entry-access';
describe('pre-release entry access',()=>{
  const wallet='0x20F8c842788f4E45872EbA755Cb8ecE58A8A8653';
  it('defaults closed without invitations',()=>{const access=entryAccess();expect(access.configured).toBe(false);expect(access.allows(wallet)).toBe(false);});
  it('allows only invited wallets regardless of casing',()=>{const access=entryAccess('invite-only',wallet);expect(access.configured).toBe(true);expect(access.allows(wallet.toLowerCase())).toBe(true);expect(access.allows('0x0000000000000000000000000000000000000001')).toBe(false);});
  it('requires explicit public mode and rejects invalid configuration',()=>{expect(entryAccess('public').allows(wallet)).toBe(true);expect(()=>entryAccess('pubic',wallet)).toThrow();expect(()=>entryAccess('invite-only','invalid')).toThrow();});
});
