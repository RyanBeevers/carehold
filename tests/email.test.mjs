import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmailInput,isValidEmailInput} from '../shared/email.ts';

test('email shortcut expansion is trimmed only at blur or submit',()=>{
 assert.equal(normalizeEmailInput('  HELLO@EXAMPLE.COM  '),'hello@example.com');
 assert.equal(normalizeEmailInput('test@example.com '),'test@example.com');
});
test('email format is validated even with text input type',()=>{
 for(const value of ['a@example.com','first.last+tag@sub.example.org'])assert.equal(isValidEmailInput(value),true);
 for(const value of ['a','a@','a@example','a @example.com','a@@example.com','a@example.com '])assert.equal(isValidEmailInput(value),false);
});
