// Tests and server use the same installed Colyseus instance when server dependencies
// are installed separately for the Docker image.
export { Server,matchMaker } from '@colyseus/core';
export { WebSocketTransport } from '@colyseus/ws-transport';
