import {describe,it,expect} from 'vitest';
import {availableRoom,roomPopulation} from '../server/galaxy/matchmaking';

describe('Continuous room player capacity',()=>{
  it('fills a room with 99 players even when 20 spectators are watching',()=>{
    const room={roomId:'occupied',clients:119,metadata:{mode:'hunt',players:99,spectators:20}};
    expect(availableRoom([room],'hunt')).toBe(room);expect(roomPopulation(room)).toBe(99);
  });
  it('opens another room for the 101st player and counts pending admissions',()=>{
    const room={roomId:'full',clients:99,metadata:{mode:'hunt',players:99,spectators:0}};
    expect(availableRoom([room],'hunt',new Map([['full',100]]))).toBeUndefined();
    expect(availableRoom([{...room,metadata:{mode:'hunt',players:100}}],'hunt')).toBeUndefined();
  });
  it('never assigns free players to a hunt room and supports older room metadata',()=>{
    const hunt={roomId:'hunt',clients:1,metadata:{mode:'hunt'}},free={roomId:'free',clients:99,metadata:{mode:'free'}};
    expect(availableRoom([hunt,free],'free')).toBe(free);
    expect(roomPopulation(free)).toBe(99);
  });
});
