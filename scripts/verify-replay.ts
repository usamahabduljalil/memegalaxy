import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { replayArena,type ReplayEvent } from '../shared/replay';
import { canonicalJSON } from '../shared/canonical';
const path=process.argv[2];
if(!path)throw new Error('Usage: npm run replay:verify -- path/to/replay.json');
const record=JSON.parse(await readFile(path,'utf8'));
const digest=createHash('sha256'),events:ReplayEvent[]=[];
for(const [i,chunk] of record.chunks.entries()){
  assert.equal(chunk.sequence,i,'Replay chunks are missing or out of order');
  digest.update(canonicalJSON(chunk.events));events.push(...chunk.events);
}
assert.equal('0x'+digest.digest('hex'),record.replay_hash,'Replay hash mismatch');
const {result}=replayArena(events);
assert.deepEqual(result,record.result,'Published results differ from recorded gameplay');
console.log(`Verified replay: ${result.length} players, matching digest and standings.`);
