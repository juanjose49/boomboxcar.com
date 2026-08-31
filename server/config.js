export const EVENT_TIME_ZONE = 'America/New_York';
export const MINIMUM_NOTICE_HOURS = 18;
export const PAYMENT_TTL_MINUTES = 30;
import { parsePartners } from './partners.js';

export const PACKAGES = Object.freeze({
  1: { hours: 1, price: 249, envKey: 'SQUARE_SERVICE_VARIATION_1H' },
  2: { hours: 2, price: 399, envKey: 'SQUARE_SERVICE_VARIATION_2H' },
  3: { hours: 3, price: 549, envKey: 'SQUARE_SERVICE_VARIATION_3H' },
  4: { hours: 4, price: 699, envKey: 'SQUARE_SERVICE_VARIATION_4H' },
  8: { hours: 8, price: 1299, envKey: 'SQUARE_SERVICE_VARIATION_8H' }
});

function configured(value) {
  return Boolean(value && !String(value).startsWith('REPLACE_WITH_'));
}

function parseCoupons(value) {
  const coupons = new Map();
  for (const entry of String(value || '').split(',').map(part => part.trim()).filter(Boolean)) {
    const [rawCode, rawType, rawValue, ...extra] = entry.split(':').map(part => part.trim());
    const code = rawCode?.toUpperCase();
    const type = rawType?.toUpperCase();
    const amount = Number(rawValue);
    if (extra.length || !/^[A-Z0-9_-]{3,40}$/.test(code || '') || !Number.isFinite(amount) || amount <= 0) continue;
    if (type === 'PERCENT' && amount <= 100) coupons.set(code, { code, type: 'PERCENT', value: amount });
    if (type === 'FIXED') coupons.set(code, { code, type: 'FIXED', value: Math.round(amount * 100) / 100 });
  }
  return coupons;
}

export function loadConfig(env = process.env) {
  const packages = Object.fromEntries(Object.entries(PACKAGES).map(([hours, pkg]) => [hours, {
    ...pkg,
    serviceVariationId: env[pkg.envKey] || ''
  }]));
  const teamMemberIds = String(env.SQUARE_TEAM_MEMBER_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(configured);
  const squareEnvironment = env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const requiredValues = [
    env.SQUARE_ACCESS_TOKEN,
    env.SQUARE_LOCATION_ID,
    ...teamMemberIds,
    ...Object.values(packages).map(pkg => pkg.serviceVariationId)
  ];

  return {
    nodeEnvironment: env.NODE_ENV || 'development',
    squareEnvironment,
    squareBaseUrl: squareEnvironment === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com',
    squareAccessToken: env.SQUARE_ACCESS_TOKEN || '',
    squareApplicationId: env.SQUARE_APPLICATION_ID || '',
    squareLocationId: env.SQUARE_LOCATION_ID || '',
    squareApiVersion: env.SQUARE_API_VERSION || '2026-07-15',
    teamMemberIds,
    packages,
    appBaseUrl: env.APP_BASE_URL || 'http://localhost:3100',
    allowedOrigin: env.ALLOWED_ORIGIN || 'http://localhost:3100',
    dataDir: env.DATA_DIR || `${process.cwd()}/data`,
    coupons: parseCoupons(env.BOOMBOXCAR_COUPONS),
    partners: parsePartners(env.BOOMBOXCAR_PARTNERS),
    squareWebhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY || '',
    squareWebhookNotificationUrl: env.SQUARE_WEBHOOK_NOTIFICATION_URL || '',
    squareWebhookConfigured: configured(env.SQUARE_WEBHOOK_SIGNATURE_KEY) && configured(env.SQUARE_WEBHOOK_NOTIFICATION_URL),
    squareConfigured: requiredValues.length >= 8 && requiredValues.every(configured),
    squareWebPaymentsConfigured: configured(env.SQUARE_APPLICATION_ID)
  };
}
