import {seal,unseal,type Envelope,type PublicKey} from './message-crypto.ts';

/** Journal content travels only inside encrypted per-participant envelopes.
 * This is still an unreviewed single-device, TOFU fictional-data prototype.
 */
export type WordKind='prompt'|'journal'|'reflection'|'discussion';
export type WordPayload={kind:WordKind,text:string,prompt:string|null};
export const MAX_WORD_WIRE_LENGTH=3000;
export function validWordPayload(value:unknown):value is WordPayload{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const item=value as Record<string,unknown>;
 if(Object.keys(item).sort().join(',')!=='kind,prompt,text')return false;
 return (item.kind==='prompt'||item.kind==='journal'||item.kind==='reflection'||item.kind==='discussion')&&
 typeof item.text==='string'&&item.text.trim().length>0&&item.text.length<=2600&&
 (item.prompt===null||typeof item.prompt==='string'&&item.prompt.length<=600);
}
export async function sealWord(payload:WordPayload,publicKey:PublicKey,spaceId:string,postId:string,recipientId:string):Promise<Envelope>{
 if(!validWordPayload(payload))throw new Error('Your writing is empty or too long.');
 const serialized=JSON.stringify(payload);
 if(serialized.length>MAX_WORD_WIRE_LENGTH)throw new Error('This entry is too long to share. Try a shorter response.');
 return seal({kind:'message',text:serialized},publicKey,spaceId,postId,recipientId);
}
export async function unsealWord(envelope:Envelope,privateKey:CryptoKey,spaceId:string,postId:string,recipientId:string):Promise<WordPayload>{
 const wrapped=await unseal(envelope,privateKey,spaceId,postId,recipientId);
 if(wrapped.kind!=='message')throw new Error('Unrecognized encrypted journal format.');
 const payload:unknown=JSON.parse(wrapped.text);
 if(!validWordPayload(payload))throw new Error('Invalid decrypted journal content.');
 return payload;
}
