import {describe,it,expect,vi} from 'vitest';
vi.mock('../server/galaxy/store',()=>({persistent:false,db:{query:vi.fn()}}));
vi.mock('../server/galaxy/chain',()=>({chain:{},deployment:'test'}));
import {adminRoles,requireAdmin} from '../server/galaxy/economy';
describe('Private admin wallet boundary',()=>{
 it('fails closed without an operator allowlist and rejects ordinary owners',()=>{vi.stubEnv('MEMEGALAXY_ECONOMY_ADMINS','');const owner={id:'wallet:ordinary',wallet:'0x1111111111111111111111111111111111111111'};expect(adminRoles(owner)).toEqual([]);expect(()=>requireAdmin(owner)).toThrow('administrator access required');vi.stubEnv('MEMEGALAXY_ECONOMY_ADMINS','0x2222222222222222222222222222222222222222');expect(()=>requireAdmin(owner,'reviewer')).toThrow();vi.unstubAllEnvs();});
 it('grants existing economy/reviewer roles only to the configured verified wallet',()=>{vi.stubEnv('MEMEGALAXY_ECONOMY_ADMINS',' 0x82EacD27A39A68f78e43a1C2e3F3b920b29a7652 ');const owner={id:'wallet:operator',wallet:'0x82eacd27a39a68f78e43a1c2e3f3b920b29a7652'};expect(adminRoles(owner)).toEqual(['economy','reviewer']);expect(()=>requireAdmin(owner)).not.toThrow();expect(()=>requireAdmin(owner,'reviewer')).not.toThrow();expect(()=>requireAdmin(owner,'treasury')).toThrow();vi.unstubAllEnvs();});
});
