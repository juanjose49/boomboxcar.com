import { randomBytes } from 'node:crypto';
import { normalizeEventAddress } from '../server/addresses.js';

function fail(message) {
  console.error(`Error: ${message}`);
  console.error('Usage: npm run partner:create -- --code CODE --name "Partner Name" --address-line1 "123 Main St" --city "Silver Spring" --state MD --postal-code 20910 --max-hours 2 --expires YYYY-MM-DD');
  process.exit(1);
}

function readArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    const value = values[index + 1];
    if (!argument.startsWith('--') || !value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
    index += 1;
    if (argument === '--code') options.code = value.trim().toUpperCase();
    else if (argument === '--name') options.name = value.trim();
    else if (argument === '--address-line1') options.addressLine1 = value.trim();
    else if (argument === '--address-line2') options.addressLine2 = value.trim();
    else if (argument === '--city') options.locality = value.trim();
    else if (argument === '--state') options.administrativeDistrictLevel1 = value.trim().toUpperCase();
    else if (argument === '--postal-code') options.postalCode = value.trim();
    else if (argument === '--max-hours') options.maxHours = Number(value);
    else if (argument === '--expires') options.expiresOn = value.trim();
    else if (argument === '--value-cap') options.valueCap = Number(value);
    else if (argument === '--future-discount') options.futureDiscountPercent = Number(value);
    else if (argument === '--new-customer-discount') options.newCustomerDiscountPercent = Number(value);
    else if (argument === '--offer-expires') options.newCustomerOfferEndsOn = value.trim();
    else if (argument === '--base-url') options.baseUrl = value.trim();
    else if (argument === '--source') options.sourceReferralId = value.trim();
    else if (argument === '--qr-campaign') options.qrCampaignId = value.trim();
    else fail(`Unknown option ${argument}.`);
  }
  return options;
}

const options = readArguments(process.argv.slice(2));
if (!/^[A-Z0-9_-]{3,40}$/.test(options.code || '')) fail('Code must be 3 to 40 letters, numbers, underscores, or hyphens.');
if (!options.name || options.name.length > 120) fail('Name is required and must be 120 characters or fewer.');
let venueAddress;
try {
  venueAddress = normalizeEventAddress({
    addressLine1: options.addressLine1,
    addressLine2: options.addressLine2,
    locality: options.locality,
    administrativeDistrictLevel1: options.administrativeDistrictLevel1,
    postalCode: options.postalCode
  });
} catch (error) { fail(error.message); }
const maxHours = options.maxHours ?? 2;
if (![2, 3, 4].includes(maxHours)) fail('Max hours must be 2, 3, or 4.');
const valueCap = options.valueCap ?? 599;
if (!Number.isFinite(valueCap) || valueCap <= 0 || valueCap > 599) fail('Value cap must be greater than 0 and no more than 599.');
const futureDiscountPercent = options.futureDiscountPercent ?? 15;
if (!Number.isFinite(futureDiscountPercent) || futureDiscountPercent <= 0 || futureDiscountPercent > 50) fail('Future discount must be greater than 0 and no more than 50.');
const newCustomerDiscountPercent = options.newCustomerDiscountPercent ?? 10;
if (!Number.isFinite(newCustomerDiscountPercent) || newCustomerDiscountPercent <= 0 || newCustomerDiscountPercent > 50) fail('New customer discount must be greater than 0 and no more than 50.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(options.expiresOn || '') || Number.isNaN(Date.parse(`${options.expiresOn}T00:00:00Z`))) fail('Expiration is required in YYYY-MM-DD format.');
const defaultOfferEnd = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
const newCustomerOfferEndsOn = options.newCustomerOfferEndsOn || defaultOfferEnd;
if (!/^\d{4}-\d{2}-\d{2}$/.test(newCustomerOfferEndsOn) || Number.isNaN(Date.parse(`${newCustomerOfferEndsOn}T00:00:00Z`))) fail('Offer expiration must use YYYY-MM-DD format.');
if (newCustomerOfferEndsOn < new Date().toISOString().slice(0, 10)) fail('Offer expiration cannot be in the past.');
if (newCustomerOfferEndsOn > options.expiresOn) fail('Offer expiration cannot be later than the partner expiration.');

let baseUrl;
try { baseUrl = new URL(options.baseUrl || 'https://boomboxcar.com'); }
catch (_) { fail('Base URL must be a valid URL.'); }
if (!['http:', 'https:'].includes(baseUrl.protocol)) fail('Base URL must use HTTP or HTTPS.');

const token = randomBytes(24).toString('base64url');
const entry = {
  token,
  code: options.code,
  name: options.name,
  venueAddress,
  maxHours,
  valueCap,
  futureDiscountPercent,
  newCustomerDiscountPercent,
  newCustomerOfferEndsOn,
  expiresOn: options.expiresOn,
  sourceReferralId: options.sourceReferralId || options.code,
  qrCampaignId: options.qrCampaignId || `${options.code}-EVENT`
};
const partnerUrl = new URL('/partner/', baseUrl);
partnerUrl.searchParams.set('pass', token);

console.log('\nAdd this object to the BOOMBOXCAR_PARTNERS JSON array:\n');
console.log(JSON.stringify(entry, null, 2));
console.log('\nPermanent partner link:\n');
console.log(partnerUrl.toString());
console.log('\nThe same page generates the public, trackable event QR code after deployment.');
