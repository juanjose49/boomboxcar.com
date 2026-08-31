import { AppError } from './errors.js';

const SERVICE_AREA_REGIONS = new Set(['DC', 'MD', 'VA']);

function cleanString(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validAddressText(value) {
  return /[\p{L}\p{N}]/u.test(value) && /^[\p{L}\p{N}\p{P}\p{Zs}]+$/u.test(value);
}

export function normalizeEventAddress(value) {
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

export function formatEventAddress(address) {
  return [address.addressLine1, address.addressLine2, address.locality,
    `${address.administrativeDistrictLevel1} ${address.postalCode}`]
    .filter(Boolean).join(', ');
}

function canonicalAddressPart(value) {
  return cleanString(value, 500).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function eventAddressesMatch(left, right) {
  const first = normalizeEventAddress(left);
  const second = normalizeEventAddress(right);
  return ['addressLine1', 'addressLine2', 'locality', 'administrativeDistrictLevel1', 'postalCode']
    .every(field => canonicalAddressPart(first[field]) === canonicalAddressPart(second[field]));
}
