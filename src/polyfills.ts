import { Buffer } from 'buffer';
// Colyseus 0.16's schema codec expects the browser Buffer implementation.
(globalThis as unknown as {Buffer:typeof Buffer}).Buffer ??= Buffer;
