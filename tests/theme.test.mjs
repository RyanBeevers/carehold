import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/theme-init.js',import.meta.url),'utf8');
function initialTheme(saved,darkSystem){
  const root={dataset:{}};
  let meta='';
  runInNewContext(source,{
    localStorage:{getItem:()=>saved},
    matchMedia:()=>({matches:darkSystem}),
    document:{documentElement:root,querySelector:()=>({setAttribute:(_k,v)=>{meta=v;}})},
  });
  return {theme:root.dataset.theme,meta};
}
test('system appearance follows OS in first paint',()=>{
  assert.deepEqual(initialTheme(null,true),{theme:'dark',meta:'#191b1a'});
  assert.deepEqual(initialTheme('system',false),{theme:'light',meta:'#f4f1e9'});
});
test('explicit user preference overrides OS appearance',()=>{
  assert.deepEqual(initialTheme('light',true),{theme:'light',meta:'#f4f1e9'});
  assert.deepEqual(initialTheme('dark',false),{theme:'dark',meta:'#191b1a'});
});
test('initialization survives local storage denial',()=>{
  const root={dataset:{}};
  assert.doesNotThrow(()=>runInNewContext(source,{
    localStorage:{getItem:()=>{throw new Error('Denied');}},
    document:{documentElement:root},
  }));
});
