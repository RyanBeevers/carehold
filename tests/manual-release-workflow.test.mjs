import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

for (const env of ['staging','production']) {
  test(env+' GitHub release is explicitly dispatched and backs up before remote mutation',()=>{
    const workflow=load('.github/workflows/manual-'+env+'.yml');
    assert.match(workflow,/workflow_dispatch:/);
    assert.doesNotMatch(workflow,/\n\s+(push|schedule|pull_request|workflow_run):/);
    assert.match(workflow,new RegExp('environment: '+env));
    assert.match(workflow,/scripts\/github-d1-backup\.sh/);
    assert.match(workflow,/actions\/upload-artifact@v4/);
    assert.match(workflow,/if-no-files-found: error/);
    assert.ok(workflow.indexOf('github-d1-backup.sh') < workflow.indexOf('upload-artifact@v4'));
    assert.ok(workflow.indexOf('upload-artifact@v4') < workflow.indexOf('github-deploy.sh'));
    assert.match(workflow,/D1_BACKUP_PASSPHRASE: \$\{\{ secrets.D1_BACKUP_PASSPHRASE \}\}/);
  });
}
test('production additionally gates main, E2E, security review and fresh main head',()=>{
  const workflow=load('.github/workflows/manual-production.yml');
  const deploy=load('scripts/github-deploy.sh');
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/E2E REVIEWED/);
  assert.match(workflow,/SECURITY REVIEWED/);
  assert.match(deploy,/git ls-remote origin refs\/heads\/main/);
  assert.match(deploy,/GITHUB_SHA/);
});
test('GitHub backup encrypts plain SQL before upload and never uploads plaintext',()=>{
  const script=load('scripts/github-d1-backup.sh');
  assert.match(script,/openssl enc -aes-256-cbc/);
  assert.match(script,/trap 'rm -rf/);
  for (const env of ['staging','production']) {
    const workflow=load('.github/workflows/manual-'+env+'.yml');
    assert.match(workflow,/path: backups\/carehold-.*\.sql\.enc/);
  }
});
