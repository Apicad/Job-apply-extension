import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoServer } from '../../scripts/demo-server.mjs';

test('portable demo serves three offline applications and rejects writes and private paths', async () => {
  const server = createDemoServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/', '/greenhouse-live.html', '/lever.html', '/ashby.html', '/hackathon.html', '/sample-resume.txt']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'none'; form-action 'none'/);
      assert.ok((await response.text()).length > 100);
    }
    assert.equal((await fetch(base + '/lever.html', { method: 'POST', body: 'synthetic' })).status, 405);
    for (const route of ['/native-host/config.json', '/package.json', '/%2e%2e/package.json']) assert.equal((await fetch(base + route)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
