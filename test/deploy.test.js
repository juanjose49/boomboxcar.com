import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cPanel deployment includes privacy assets and waits for required dependencies', async () => {
  const script = await readFile(new URL('../scripts/deploy-cpanel.sh', import.meta.url), 'utf8');

  assert.match(script, /dist\/public\/privacy-consent\.js/);
  assert.match(script, /dist\/public\/privacy-consent\.css/);
  assert.match(script, /dist\/public\/privacy\/index\.html/);
  assert.match(script, /test -d "\$app_root\/node_modules"/);
  assert.match(script, /cmp -s .*package-lock\.json/);
  assert.match(script, /run NPM Install and then Restart Application/);

  const dependencyBranch = script.indexOf('if [ "$needs_npm_install" -eq 1 ]');
  const restart = script.indexOf('touch "$app_root/tmp/restart.txt"', dependencyBranch);
  assert.ok(dependencyBranch > 0);
  assert.ok(restart > dependencyBranch, 'Passenger restart must occur only after the dependency check');
});
