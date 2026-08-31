import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public pages gate Google Analytics behind the shared privacy choice', async () => {
  const pages = await Promise.all(['index.html', 'es/index.html', 'confirmation/index.html'].map(read));
  for (const page of pages) {
    assert.match(page, /privacy-consent\.js/);
    assert.doesNotMatch(page, /<script[^>]+googletagmanager\.com\/gtag\/js/);
  }

  const consent = await read('privacy-consent.js');
  assert.match(consent, /choice === 'granted'/);
  assert.match(consent, /boomboxcar:analytics-consent/);
  assert.match(consent, /ga-disable-/);
  assert.match(consent, /const partnerEntry = Boolean\(window\.__boomboxcarPartnerEntry\)/);
});

test('campaign session attribution follows the analytics choice', async () => {
  const booking = await read('booking.js');
  assert.match(booking, /BoomBoxCarPrivacy\?\.analyticsAllowed\(\)/);
  assert.match(booking, /sessionStorage\.removeItem\(attributionKey\)/);
  assert.match(booking, /boomboxcar:analytics-consent/);
});

test('privacy and storage disclosures are available in English and Spanish', async () => {
  const [english, spanish] = await Promise.all([
    read('privacy/index.html'),
    read('es/privacidad/index.html')
  ]);
  assert.match(english, /Necessary browser storage/);
  assert.match(english, /Optional analytics and campaign measurement/);
  assert.match(spanish, /Almacenamiento necesario del navegador/);
  assert.match(spanish, /Analítica opcional y medición de campañas/);
});
