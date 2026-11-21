import test from 'node:test';
import assert from 'node:assert/strict';
import {createEncryptedJournalBackup,openEncryptedJournalBackup} from '../src/lib/journal-backup.ts';

globalThis.btoa??=(v=>Buffer.from(v,'binary').toString('base64'));
globalThis.atob??=(v=>Buffer.from(v,'base64').toString('binary'));

const user='test-user',household='test-circle',password='this-is-a-unique-test-passphrase';
const entries=[
 {id:'11111111-1111-4111-8111-111111111111',text:'Private fictional reflection only',prompt:'Imaginary question?',createdAt:1,updatedAt:2,revision:1},
 {id:'22222222-2222-4222-8222-222222222222',text:'Another fictional note',prompt:null,createdAt:3,updatedAt:4,revision:1}
];

test('encrypted journal backup roundtrips without plaintext disclosure',async()=>{
 const one=await createEncryptedJournalBackup(user,household,entries,password);
 const two=await createEncryptedJournalBackup(user,household,entries,password);
 assert.notEqual(one,two,'different random salts and IVs');
 assert.doesNotMatch(one,/Private fictional reflection only|Imaginary question\?/);
 const restored=await openEncryptedJournalBackup(one,user,household,password);
 assert.deepEqual(restored,entries.map(({id,text,prompt})=>({id,text,prompt})));
});
test('wrong passphrase, incorrect account and tampering fail closed',async()=>{
 const file=await createEncryptedJournalBackup(user,household,entries,password);
 await assert.rejects(openEncryptedJournalBackup(file,user,household,'incorrect-passphrase-123'),/decrypt/);
 await assert.rejects(openEncryptedJournalBackup(file,'other-user',household,password),/another Carehold account/);
 await assert.rejects(openEncryptedJournalBackup(file,user,'other-circle',password),/another Carehold account/);
 const tampered=JSON.parse(file);
 tampered.ciphertext=(tampered.ciphertext.startsWith('A')?'B':'A')+tampered.ciphertext.slice(1);
 await assert.rejects(openEncryptedJournalBackup(JSON.stringify(tampered),user,household,password),/decrypt/);
});
test('export blocks too-short passwords and duplicate saved entry identifiers',async()=>{
 await assert.rejects(createEncryptedJournalBackup(user,household,entries,'too-short'),/at least 12/);
 await assert.rejects(createEncryptedJournalBackup(user,household,[entries[0],entries[0]],password),/repeated/);
});
