import { mkdir, appendFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { ADDONS, PACKAGES } from './config.js';
import { AppError } from './errors.js';

function cleanString(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return /^\+?[0-9 ()-]{9,20}$/.test(value);
}

export function validateReservation(input) {
  const durationHours = Number(input.durationHours);
  if (!PACKAGES[durationHours]) throw new AppError(400, 'INVALID_DURATION', 'Choose a valid duration.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate || '')) throw new AppError(400, 'INVALID_DATE', 'Choose a valid event date.');
  if (!input.startAt || !Number.isFinite(Date.parse(input.startAt))) throw new AppError(400, 'INVALID_TIME', 'Choose an available arrival time.');

  const addonKeys = Array.isArray(input.addons) ? [...new Set(input.addons)] : [];
  if (addonKeys.some(key => !ADDONS[key])) throw new AppError(400, 'INVALID_ADDON', 'One or more add-ons are invalid.');

  const customer = {
    givenName: cleanString(input.customer?.givenName, 100),
    familyName: cleanString(input.customer?.familyName, 100),
    email: cleanString(input.customer?.email, 254).toLowerCase(),
    phone: cleanString(input.customer?.phone, 24)
  };
  if (!customer.givenName || !customer.familyName) throw new AppError(400, 'INVALID_NAME', 'First and last name are required.');
  if (!validEmail(customer.email)) throw new AppError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  if (!validPhone(customer.phone)) throw new AppError(400, 'INVALID_PHONE', 'Enter a valid phone number.');

  const details = {
    address: cleanString(input.address, 500),
    eventType: cleanString(input.eventType, 100),
    setting: cleanString(input.setting, 100),
    attendance: Number(input.attendance),
    requests: cleanString(input.requests, 1500)
  };
  if (!details.address || !details.eventType || !details.setting) throw new AppError(400, 'MISSING_EVENT_DETAILS', 'Complete the required event details.');
  if (!Number.isInteger(details.attendance) || details.attendance < 1 || details.attendance > 100000) {
    throw new AppError(400, 'INVALID_ATTENDANCE', 'Enter a valid expected attendance.');
  }

  return {
    locale: input.locale === 'es' ? 'es' : 'en',
    eventDate: input.eventDate,
    startAt: new Date(input.startAt).toISOString(),
    durationHours,
    addonKeys,
    customer,
    details
  };
}

export function createReservationId(now = new Date()) {
  return `BBC-${now.getUTCFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function calculatePricing(durationHours, addonKeys) {
  const basePrice = PACKAGES[durationHours].price;
  const addons = addonKeys.map(key => ({ key, ...ADDONS[key] }));
  const total = addons.reduce((sum, addon) => sum + (addon.price || 0), basePrice);
  return { basePrice, addons, total, hasCustomQuote: addons.some(addon => addon.price === null) };
}

export function buildCustomerNote({ reservationId, reservation, pricing }) {
  const money = value => `$${value.toLocaleString('en-US')}`;
  const addonLines = pricing.addons.length
    ? pricing.addons.map(addon => `- ${addon.name}: ${addon.price === null ? 'custom quote' : `+${money(addon.price)}`}`)
    : ['- None'];
  return [
    `BOOMBOXCAR RESERVATION ${reservationId}`,
    `Duration: ${reservation.durationHours} hour${reservation.durationHours === 1 ? '' : 's'} (${money(pricing.basePrice)})`,
    'Add-ons:',
    ...addonLines,
    `Estimated total: ${money(pricing.total)}${pricing.hasCustomQuote ? ' plus custom-quote items' : ''}`,
    `Event address: ${reservation.details.address}`,
    `Event type: ${reservation.details.eventType}`,
    `Setting: ${reservation.details.setting}`,
    `Expected attendance: ${reservation.details.attendance}`,
    `Special requests: ${reservation.details.requests || 'None'}`
  ].join('\n');
}

export async function persistReservation(dataDir, reservation) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'reservations.jsonl');
  await appendFile(file, `${JSON.stringify(reservation)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(file, 0o600);
}
