import {getAddress} from 'viem';

/** A compact default identifier; publicPlayerId remains the stable identity. */
export function walletPlayerName(address?: string) {
  return address ? getAddress(address).slice(0, 10) : 'Player';
}
