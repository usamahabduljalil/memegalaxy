import {createHash} from 'node:crypto';
// Identity derivation is independent of login/admission secrets and safe for workers.
export const publicPlayerId=(ownerId:string)=>`human:${createHash('sha256').update(ownerId).digest('hex').slice(0,32)}`;
