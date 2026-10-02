import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createWorld,connection} from '../shared/galaxy/engine';
import type {Admission} from '../server/galaxy/auth';

const fixtures=vi.hoisted(()=>({query:vi.fn(),config:vi.fn(),funded:vi.fn()}));
vi.mock('../server/galaxy/store',()=>({db:{query:fixtures.query}}));
vi.mock('../server/galaxy/economy',()=>({config:fixtures.config,dropsFunded:fixtures.funded,collectDrop:vi.fn(),expireDrop:vi.fn(),reserveDrop:vi.fn()}));
import {HuntRoom} from '../server/galaxy/hunt-room';

describe('Hunting lease recovery',()=>{
  beforeEach(()=>{
    vi.spyOn(Date,'now').mockReturnValue(1_000_000);
    fixtures.query.mockReset();fixtures.config.mockReset();fixtures.funded.mockReset();
    fixtures.config.mockResolvedValue({settings:{enabled:true}});fixtures.funded.mockResolvedValue(true);
  });
  afterEach(()=>vi.restoreAllMocks());
  const admissions=():Admission[]=>['valid','expired'].map(id=>({id,name:id,controller:'human',owner:id,roomId:'room',scope:'hunt',huntSession:id}));
  const world=()=>createWorld('hunt',42,admissions().map(a=>({id:a.id,name:a.name,controller:a.controller})));
  const settle=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

  it('removes only lost leases and leaves drops enabled for valid hunters',async()=>{
    fixtures.query.mockResolvedValue({rows:[{id:'valid'}],rowCount:1});const expired=vi.fn();
    const room=new HuntRoom('room',admissions,()=>{},expired);room.tick(world());await settle();
    expect(expired).toHaveBeenCalledWith(['expired']);expect(room.paused).toBe(false);
  });
  it('pauses rewards during a database failure without declaring accounts expired',async()=>{
    fixtures.query.mockRejectedValue(new Error('database unavailable'));const expired=vi.fn();
    const room=new HuntRoom('room',admissions,()=>{},expired);room.tick(world());await settle();
    expect(room.paused).toBe(true);expect(expired).not.toHaveBeenCalled();
  });
  it('resumes after storage returns and removes sessions whose leases really expired',async()=>{
    fixtures.query.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue({rows:[],rowCount:0});const expired=vi.fn();
    const room=new HuntRoom('room',admissions,()=>{},expired),w=world();room.tick(w);await settle();
    vi.mocked(Date.now).mockReturnValue(1_006_000);room.tick(w);await settle();
    expect(expired).toHaveBeenCalledWith(['valid','expired']);expect(room.paused).toBe(false);
  });
  it('does not extend disconnected sessions during their reconnect grace period',async()=>{
    fixtures.query.mockResolvedValue({rows:[{id:'valid'}],rowCount:1});const expired=vi.fn(),w=world();connection(w,'expired',false);
    const room=new HuntRoom('room',admissions,()=>{},expired);room.tick(w);await settle();
    expect(fixtures.query.mock.calls[0][1][0]).toEqual(['valid']);expect(expired).not.toHaveBeenCalled();
  });
});
