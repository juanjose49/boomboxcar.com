export const EVENT_TIME_ZONE = 'America/New_York';
export const MINIMUM_NOTICE_HOURS = 18;

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
    squareConfigured: requiredValues.length >= 8 && requiredValues.every(configured)
  };
}
