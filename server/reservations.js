import { mkdir, appendFile, chmod, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { PACKAGES } from './config.js';
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

const SERVICE_AREA_REGIONS = new Set(['DC', 'MD', 'VA']);

function validAddressText(value) {
  return /[\p{L}\p{N}]/u.test(value) && /^[\p{L}\p{N}\p{P}\p{Zs}]+$/u.test(value);
}

function normalizeEventAddress(value) {
  let source = value;
  if (typeof value === 'string') {
    const parts = value.split(',').map(part => part.trim()).filter(Boolean);
    const stateAndZip = parts.at(-1)?.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    source = parts.length >= 3 && stateAndZip ? {
      addressLine1: parts.slice(0, -2).join(', '),
      locality: parts.at(-2),
      administrativeDistrictLevel1: stateAndZip[1],
      postalCode: stateAndZip[2]
    } : {};
  }
  const address = {
    addressLine1: cleanString(source?.addressLine1, 500),
    addressLine2: cleanString(source?.addressLine2, 500),
    locality: cleanString(source?.locality, 300),
    administrativeDistrictLevel1: cleanString(source?.administrativeDistrictLevel1, 2).toUpperCase(),
    postalCode: cleanString(source?.postalCode, 10)
  };
  if (!address.addressLine1 || !address.locality || !address.administrativeDistrictLevel1 || !address.postalCode) {
    throw new AppError(400, 'INVALID_ADDRESS', 'Enter the street address, city, state, and ZIP code.');
  }
  if (![address.addressLine1, address.addressLine2, address.locality].filter(Boolean).every(validAddressText)) {
    throw new AppError(400, 'INVALID_ADDRESS', 'The event address contains unsupported characters.');
  }
  if (!SERVICE_AREA_REGIONS.has(address.administrativeDistrictLevel1)) {
    throw new AppError(400, 'OUTSIDE_SERVICE_AREA', 'Online booking is available in DC, Maryland, and Virginia. Contact booking@boomboxcar.com for custom pricing outside the DMV.');
  }
  if (!/^\d{5}(?:-\d{4})?$/.test(address.postalCode)) {
    throw new AppError(400, 'INVALID_POSTAL_CODE', 'Enter a valid US ZIP code.');
  }
  return address;
}

function formatEventAddress(address) {
  return [address.addressLine1, address.addressLine2, address.locality,
    `${address.administrativeDistrictLevel1} ${address.postalCode}`]
    .filter(Boolean).join(', ');
}

function normalizeCustomerName(givenName, familyName) {
  const parts = `${cleanString(givenName, 100)} ${cleanString(familyName, 100)}`
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    givenName: parts[0] || '',
    familyName: parts.slice(1).join(' ')
  };
}

export function normalizeCouponCode(value) {
  const code = cleanString(value, 40).toUpperCase();
  if (code && !/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new AppError(400, 'INVALID_COUPON', 'Enter a valid coupon code.');
  }
  return code;
}

export function normalizeModifierSelections(input) {
  const modifierIds = new Set();
  return Array.isArray(input) ? input.map(entry => {
    const id = cleanString(entry?.id, 100);
    const quantity = Number(entry?.quantity || 1);
    if (!id || modifierIds.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new AppError(400, 'INVALID_MODIFIER', 'One or more modifiers are invalid.');
    }
    modifierIds.add(id);
    return { id, quantity };
  }) : [];
}

export function validateReservation(input) {
  const durationHours = Number(input.durationHours);
  if (!PACKAGES[durationHours]) throw new AppError(400, 'INVALID_DURATION', 'Choose a valid duration.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate || '')) throw new AppError(400, 'INVALID_DATE', 'Choose a valid event date.');
  if (!input.startAt || !Number.isFinite(Date.parse(input.startAt))) throw new AppError(400, 'INVALID_TIME', 'Choose an available arrival time.');

  const modifiers = normalizeModifierSelections(input.modifiers);

  const customerName = normalizeCustomerName(input.customer?.givenName, input.customer?.familyName);
  const customer = {
    ...customerName,
    email: cleanString(input.customer?.email, 254).toLowerCase(),
    phone: cleanString(input.customer?.phone, 24)
  };
  if (!customer.givenName || !customer.familyName) throw new AppError(400, 'INVALID_NAME', 'First and last name are required.');
  if (!validEmail(customer.email)) throw new AppError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  if (!validPhone(customer.phone)) throw new AppError(400, 'INVALID_PHONE', 'Enter a valid phone number.');

  const details = {
    address: normalizeEventAddress(input.address),
    eventType: cleanString(input.eventType, 100),
    setting: cleanString(input.setting, 100),
    attendance: Number(input.attendance),
    requests: cleanString(input.requests, 1500)
  };
  if (!details.eventType || !details.setting) throw new AppError(400, 'MISSING_EVENT_DETAILS', 'Complete the required event details.');
  if (!Number.isInteger(details.attendance) || details.attendance < 1 || details.attendance > 100000) {
    throw new AppError(400, 'INVALID_ATTENDANCE', 'Enter a valid expected attendance.');
  }

  return {
    locale: input.locale === 'es' ? 'es' : 'en',
    eventDate: input.eventDate,
    startAt: new Date(input.startAt).toISOString(),
    durationHours,
    modifiers,
    couponCode: normalizeCouponCode(input.couponCode),
    customer,
    details
  };
}

export function createReservationId(now = new Date()) {
  return `BBC-${now.getUTCFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function createConfirmationToken() {
  return randomBytes(24).toString('base64url');
}

export function findAvailableSlot(slots, startAt) {
  const selectedTime = Date.parse(startAt);
  return slots.find(slot => Date.parse(slot.startAt) === selectedTime);
}

export function calculatePricing(packageDetails, selections) {
  const selectedById = new Map(selections.map(selection => [selection.id, selection]));
  for (const group of packageDetails.modifierGroups) {
    for (const modifier of group.modifiers) {
      if (modifier.included) selectedById.set(modifier.id, { id: modifier.id, quantity: 1 });
    }
  }
  const modifiers = [];
  for (const group of packageDetails.modifierGroups) {
    const groupSelections = group.modifiers
      .filter(modifier => selectedById.has(modifier.id))
      .map(modifier => ({ ...modifier, quantity: selectedById.get(modifier.id).quantity }));
    const selectionCount = groupSelections.reduce((sum, modifier) => sum + modifier.quantity, 0);
    if (selectionCount < group.minSelections || (group.maxSelections > 0 && selectionCount > group.maxSelections)) {
      throw new AppError(400, 'INVALID_MODIFIER_SELECTION', `Choose a valid number of options from ${group.name}.`);
    }
    if (!group.allowQuantities && groupSelections.some(modifier => modifier.quantity !== 1)) {
      throw new AppError(400, 'INVALID_MODIFIER_QUANTITY', `${group.name} does not allow multiple quantities.`);
    }
    modifiers.push(...groupSelections.map(modifier => ({
      id: modifier.id,
      groupId: group.id,
      name: modifier.name,
      quantity: modifier.quantity,
      unitPrice: modifier.price,
      price: modifier.price * modifier.quantity,
      catalogObjectId: modifier.catalogObjectId || null,
      included: Boolean(modifier.included)
    })));
  }
  const selectedIncludedCount = modifiers.filter(modifier => modifier.included && selections.some(selection => selection.id === modifier.id)).length;
  if (modifiers.length - modifiers.filter(modifier => modifier.included).length !== selections.length - selectedIncludedCount) {
    throw new AppError(400, 'INVALID_MODIFIER', 'One or more modifiers are not available for this package.');
  }
  const total = modifiers.reduce((sum, modifier) => sum + modifier.price, packageDetails.basePrice);
  return { basePrice: packageDetails.basePrice, modifiers, total, currency: packageDetails.currency };
}

export function applyCoupon(pricing, coupon) {
  if (!coupon) return pricing;
  const subtotalCents = Math.round(pricing.total * 100);
  const discountCents = coupon.type === 'PERCENT'
    ? coupon.value === 100 ? subtotalCents - 1 : Math.round(subtotalCents * coupon.value / 100)
    : Math.round(coupon.value * 100);
  const appliedCents = Math.max(0, discountCents);
  if (appliedCents >= subtotalCents) {
    throw new AppError(400, 'COUPON_EXCEEDS_TOTAL', 'This coupon must leave at least $0.01 due for payment.');
  }
  return {
    ...pricing,
    subtotal: pricing.total,
    discount: {
      code: coupon.code,
      name: `Coupon ${coupon.code}`,
      type: coupon.type,
      value: coupon.value,
      amount: appliedCents / 100
    },
    total: (subtotalCents - appliedCents) / 100
  };
}

export function buildCustomerNote({ reservationId, reservation, pricing }) {
  const money = value => `$${value.toLocaleString('en-US')}`;
  const addonLines = pricing.modifiers.length
    ? pricing.modifiers.map(modifier => `- ${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}: ${modifier.included ? 'Included ($0)' : `+${money(modifier.price)}`}`)
    : ['- None'];
  return [
    `BOOMBOXCAR RESERVATION ${reservationId}`,
    `Duration: ${reservation.durationHours} hour${reservation.durationHours === 1 ? '' : 's'} (${money(pricing.basePrice)})`,
    'Included with every booking: Professional-grade audio equipment, the inflatable BoomBox, two wireless microphones, licensed music and commercial insurance, daytime bubbles, nighttime RGB light panels, MC support and announcements, and on-board power with no outlets required.',
    'Optional add-ons: Shade awning and laser and haze effects are available for an additional charge.',
    'Staff scope: BoomBoxCar staff set up and operate the system and provide MC support and announcements. Dedicated DJ service is not included; the client controls music selections, programming, and the event message.',
    'Add-ons:',
    ...addonLines,
    ...(pricing.discount ? [`Coupon ${pricing.discount.code}: -${money(pricing.discount.amount)}`] : []),
    `Estimated total: ${money(pricing.total)}`,
    `Event address: ${formatEventAddress(reservation.details.address)}`,
    `Event type: ${reservation.details.eventType}`,
    `Setting: ${reservation.details.setting}`,
    `Expected attendance: ${reservation.details.attendance}`,
    `Special requests: ${reservation.details.requests || 'None'}`,
    `Event contact: ${reservation.customer.givenName} ${reservation.customer.familyName}`,
    `Contact email: ${reservation.customer.email}`,
    `Contact phone: ${reservation.customer.phone}`
  ].join('\n');
}

export async function persistReservation(dataDir, reservation) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'reservations.jsonl');
  await appendFile(file, `${JSON.stringify(reservation)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(file, 0o600);
}

export async function readReservationRecords(dataDir) {
  try {
    const contents = await readFile(path.join(dataDir, 'reservations.jsonl'), 'utf8');
    return contents.split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch (_) { return []; }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
