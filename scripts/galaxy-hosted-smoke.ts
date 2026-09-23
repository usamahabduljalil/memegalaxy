import { Client } from 'colyseus.js';

const origin = process.env.MEMEGALAXY_API_URL ?? 'https://memegalaxy-staging-production.up.railway.app';
const response = await fetch(`${origin}/api/v2/free/admission`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Health Check' })
});
if (!response.ok) throw new Error(`Free admission failed: ${response.status}`);
const { roomId, token } = await response.json() as { roomId: string; token: string };
const client = new Client(origin.replace(/^http/, 'ws'));
const room = await client.joinById(roomId, { token });
try {
  const frame = await Promise.race([
    new Promise<unknown>(resolve => room.onMessage('frame', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('No hosted frame within five seconds')), 5000))
  ]);
  if (!frame) throw new Error('Empty hosted frame');
  console.log('Hosted free-play admission, WebSocket join, and first frame passed');
} finally {
  await room.leave();
}
