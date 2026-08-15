import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

async function withServer(env, callback, fetchImpl = globalThis.fetch) {
  const server = createServer(createApp({ env, fetchImpl }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { await callback(`http://127.0.0.1:${address.port}`); }
  finally { server.close(); await once(server, 'close'); }
}

const placeholderEnv = {
  NODE_ENV: 'production', SQUARE_ENVIRONMENT: 'sandbox',
  SQUARE_ACCESS_TOKEN: 'REPLACE_WITH_SQUARE_SANDBOX_ACCESS_TOKEN',
  SQUARE_LOCATION_ID: 'REPLACE_WITH_SQUARE_LOCATION_ID',
  SQUARE_TEAM_MEMBER_IDS: 'REPLACE_WITH_COMMA_SEPARATED_TEAM_MEMBER_IDS',
  SQUARE_SERVICE_VARIATION_1H: 'REPLACE_WITH_1H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_2H: 'REPLACE_WITH_2H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_3H: 'REPLACE_WITH_3H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_4H: 'REPLACE_WITH_4H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_8H: 'REPLACE_WITH_8H_VARIATION_ID',
  APP_BASE_URL: 'http://localhost', ALLOWED_ORIGIN: 'http://localhost'
};

test('health and public config never expose the access token', async () => {
  await withServer(placeholderEnv, async baseUrl => {
    const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.squareConfigured, false);
    const config = await fetch(`${baseUrl}/api/config`).then(response => response.json());
    assert.equal(config.ready, false);
    assert.equal(config.paymentTtlMinutes, 30);
    assert.equal(JSON.stringify(config).includes('ACCESS_TOKEN'), false);
  });
});

test('availability reports an unconfigured Sandbox without contacting Square', async () => {
  await withServer(placeholderEnv, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/availability`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-08-20', durationHours: 3 })
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'SQUARE_NOT_CONFIGURED');
  });
});
