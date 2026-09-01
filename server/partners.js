import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';
import { eventAddressesMatch, formatEventAddress, normalizeEventAddress } from './addresses.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;
const RETAIL_VALUES = Object.freeze({ 1: 249, 2: 399, 3: 499, 4: 599 });
const DEFAULT_VALUE_CAP = 599;
const DEFAULT_FUTURE_DISCOUNT_PERCENT = 15;

function clean(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizePartnerEntry(entry) {
  const token = clean(entry?.token, 128);
  const code = clean(entry?.code, 40).toUpperCase();
  const name = clean(entry?.name, 120);
  const minHours = Number(entry?.minHours ?? 2);
  const maxHours = Number(entry?.maxHours ?? 2);
  const valueCap = Number(entry?.valueCap ?? DEFAULT_VALUE_CAP);
  const futureDiscountPercent = Number(entry?.futureDiscountPercent ?? DEFAULT_FUTURE_DISCOUNT_PERCENT);
  const venueAddress = normalizeEventAddress(entry?.venueAddress);
  const expiresOn = clean(entry?.expiresOn, 10);
  const newCustomerDiscountPercent = Number(entry?.newCustomerDiscountPercent ?? 10);
  const newCustomerOfferEndsOn = clean(entry?.newCustomerOfferEndsOn, 10);
  const sourceReferralId = clean(entry?.sourceReferralId || code, 100);
  const qrCampaignId = clean(entry?.qrCampaignId || `${code}-EVENT`, 100);
  if (!TOKEN_PATTERN.test(token)) throw new AppError(400, 'INVALID_PARTNER_TOKEN', 'Partner token is invalid.');
  if (!CODE_PATTERN.test(code)) throw new AppError(400, 'INVALID_PARTNER_CODE', 'Partner code must be 3 to 40 letters, numbers, underscores, or hyphens.');
  if (!name) throw new AppError(400, 'INVALID_PARTNER_NAME', 'Partner name is required.');
  if (![1, 2, 3, 4].includes(minHours) || ![1, 2, 3, 4].includes(maxHours) || minHours > maxHours) {
    throw new AppError(400, 'INVALID_PARTNER_HOURS', 'Activation hours must use a valid minimum and maximum from 1 to 4 hours.');
  }
  if (!Number.isFinite(valueCap) || valueCap <= 0 || valueCap > DEFAULT_VALUE_CAP) throw new AppError(400, 'INVALID_PARTNER_VALUE', 'Partner value must be greater than 0 and no more than $599.');
  if (valueCap < RETAIL_VALUES[maxHours]) {
    throw new AppError(400, 'INVALID_PARTNER_VALUE', `Partner value must cover the configured ${maxHours}-hour activation.`);
  }
  if (!Number.isFinite(futureDiscountPercent) || futureDiscountPercent <= 0 || futureDiscountPercent > 50) throw new AppError(400, 'INVALID_PARTNER_RATE', 'Future discount must be greater than 0 and no more than 50 percent.');
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new AppError(400, 'INVALID_PARTNER_EXPIRATION', 'Partner expiration must use YYYY-MM-DD.');
  if (!Number.isFinite(newCustomerDiscountPercent) || newCustomerDiscountPercent <= 0 || newCustomerDiscountPercent > 50) throw new AppError(400, 'INVALID_CAMPAIGN_RATE', 'New-customer discount must be greater than 0 and no more than 50 percent.');
  if (newCustomerOfferEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(newCustomerOfferEndsOn)) throw new AppError(400, 'INVALID_CAMPAIGN_EXPIRATION', 'Event offer expiration must use YYYY-MM-DD.');
  if (newCustomerOfferEndsOn && expiresOn && newCustomerOfferEndsOn > expiresOn) throw new AppError(400, 'INVALID_CAMPAIGN_EXPIRATION', 'Event offer expiration cannot be later than the partner expiration.');
  if (!/^[A-Za-z0-9_.:-]{3,100}$/.test(sourceReferralId) || !/^[A-Za-z0-9_.:-]{3,100}$/.test(qrCampaignId)) {
    throw new AppError(400, 'INVALID_PARTNER_ATTRIBUTION', 'Source and QR campaign identifiers may use letters, numbers, periods, colons, underscores, and hyphens.');
  }
  return Object.freeze({
    token, code, name, minHours, maxHours, valueCap: Math.round(valueCap * 100) / 100,
    futureDiscountPercent: Math.round(futureDiscountPercent * 100) / 100,
    venueAddress: Object.freeze(venueAddress), expiresOn,
    newCustomerDiscountPercent: Math.round(newCustomerDiscountPercent * 100) / 100,
    newCustomerOfferEndsOn, active: entry.active !== false, sourceReferralId, qrCampaignId
  });
}

export function createPartnerEntry(input, token = randomBytes(24).toString('base64url')) {
  return normalizePartnerEntry({ ...input, token });
}

export function partnerConfigEntry(partner) {
  return {
    token: partner.token, code: partner.code, name: partner.name, venueAddress: partner.venueAddress,
    minHours: partner.minHours, maxHours: partner.maxHours, valueCap: partner.valueCap,
    futureDiscountPercent: partner.futureDiscountPercent,
    newCustomerDiscountPercent: partner.newCustomerDiscountPercent,
    newCustomerOfferEndsOn: partner.newCustomerOfferEndsOn, expiresOn: partner.expiresOn,
    sourceReferralId: partner.sourceReferralId, qrCampaignId: partner.qrCampaignId, active: partner.active
  };
}

export function parsePartners(value) {
  if (!value) return new Map();
  let entries;
  try { entries = JSON.parse(value); }
  catch (_) { return new Map(); }
  if (!Array.isArray(entries)) return new Map();
  const partners = new Map();
  for (const entry of entries) {
    try {
      const partner = normalizePartnerEntry(entry);
      if (![...partners.values()].some(existing => existing.code === partner.code)) partners.set(partner.token, partner);
    } catch (_) {}
  }
  return partners;
}

export function resolvePartner(partners, token, now = new Date()) {
  const normalized = clean(token, 128);
  if (!TOKEN_PATTERN.test(normalized)) throw new AppError(404, 'PARTNER_PASS_NOT_FOUND', 'Partner Pass not found.');
  const partner = partners.get(normalized);
  if (!partner || !partner.active) throw new AppError(404, 'PARTNER_PASS_NOT_FOUND', 'Partner Pass not found.');
  if (partner.expiresOn && partner.expiresOn < now.toISOString().slice(0, 10)) {
    throw new AppError(410, 'PARTNER_PASS_EXPIRED', 'This Partner Pass has expired.');
  }
  return partner;
}

export function publicPartner(partner, redemptionStatus = 'available') {
  return {
    code: partner.code,
    name: partner.name,
    minHours: partner.minHours,
    maxHours: partner.maxHours,
    valueCap: partner.valueCap,
    futureDiscountPercent: partner.futureDiscountPercent,
    activationAvailable: redemptionStatus === 'available',
    activationPending: redemptionStatus === 'claimed',
    ongoingRateAvailable: redemptionStatus === 'redeemed',
    venueAddress: partner.venueAddress,
    formattedVenueAddress: formatEventAddress(partner.venueAddress),
    eventOffer: partner.newCustomerOfferEndsOn ? {
      campaignId: partner.qrCampaignId,
      discountPercent: partner.newCustomerDiscountPercent,
      endsOn: partner.newCustomerOfferEndsOn
    } : null,
    eligibleDurations: [1, 2, 3, 4].filter(hours => hours >= partner.minHours && hours <= partner.maxHours),
    retailValues: Object.fromEntries(Object.entries(RETAIL_VALUES).filter(([hours]) => Number(hours) >= partner.minHours && Number(hours) <= partner.maxHours)),
    expiresOn: partner.expiresOn || null
  };
}

export function resolveCampaign(partners, campaignId, now = new Date()) {
  const normalized = clean(campaignId, 100);
  if (!/^[A-Za-z0-9_.:-]{3,100}$/.test(normalized)) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  const partner = [...partners.values()].find(entry => entry.qrCampaignId === normalized && entry.active);
  const today = now.toISOString().slice(0, 10);
  if (!partner || !partner.newCustomerOfferEndsOn || partner.newCustomerOfferEndsOn < today
    || (partner.expiresOn && partner.expiresOn < today)) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  }
  return {
    id: partner.qrCampaignId,
    partnerCode: partner.code,
    partnerName: partner.name,
    sourceReferralId: partner.sourceReferralId,
    discountPercent: partner.newCustomerDiscountPercent,
    endsOn: partner.newCustomerOfferEndsOn
  };
}

export function publicCampaign(campaign) {
  return { id: campaign.id, discountPercent: campaign.discountPercent, endsOn: campaign.endsOn };
}

export function campaignBookingUrl(baseUrl, campaign) {
  const url = new URL('/', baseUrl);
  url.searchParams.set('ref', campaign.sourceReferralId);
  url.searchParams.set('qr', campaign.id);
  url.searchParams.set('utm_source', 'event_qr');
  url.searchParams.set('utm_medium', 'offline');
  url.searchParams.set('utm_campaign', campaign.id);
  return url.toString();
}

export function applyPartnerPass(pricing, partner, durationHours) {
  const minHours = partner.minHours ?? 2;
  if (![1, 2, 3, 4].includes(durationHours) || durationHours < minHours || durationHours > partner.maxHours) {
    const durationDescription = minHours === partner.maxHours
      ? `up to ${partner.maxHours} ${partner.maxHours === 1 ? 'hour' : 'hours'}`
      : `${minHours} to ${partner.maxHours} hours`;
    throw new AppError(400, 'PARTNER_DURATION_NOT_ELIGIBLE', `This Partner Pass covers ${durationDescription}.`);
  }
  const valueCap = partner.valueCap ?? DEFAULT_VALUE_CAP;
  const discountAmount = Math.min(pricing.total, valueCap);
  return {
    ...pricing,
    subtotal: pricing.total,
    partnerDiscount: {
      code: partner.code,
      name: 'BoomBoxCar Partner Pass',
      amount: discountAmount,
      valueCap,
      retailValue: discountAmount,
      packageRetailValue: RETAIL_VALUES[durationHours],
      benefitType: 'activation'
    },
    total: Math.round((pricing.total - discountAmount) * 100) / 100
  };
}

export function applyPartnerRate(pricing, partner) {
  const discountAmount = Math.round(pricing.total * partner.futureDiscountPercent) / 100;
  return {
    ...pricing,
    subtotal: pricing.total,
    partnerDiscount: {
      code: partner.code,
      name: `${partner.futureDiscountPercent}% Partner Rate`,
      amount: discountAmount,
      percentage: partner.futureDiscountPercent,
      benefitType: 'futureRate'
    },
    total: Math.round((pricing.total - discountAmount) * 100) / 100
  };
}

export function validatePartnerVenue(partner, address) {
  if (!eventAddressesMatch(partner.venueAddress, address)) {
    throw new AppError(403, 'PARTNER_VENUE_NOT_APPROVED', 'This partner benefit is valid only for bookings at the partner venue address.');
  }
  return partner.venueAddress;
}

export function normalizeAttribution(input) {
  const fields = ['sourceReferralId', 'qrCampaignId', 'ref', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent'];
  return Object.fromEntries(fields.flatMap(field => {
    const value = clean(input?.[field], 100);
    return value && /^[A-Za-z0-9_.:-]+$/.test(value) ? [[field, value]] : [];
  }));
}

export function normalizePartnerPermissions(input) {
  const permissions = {
    signageAndQr: input?.signageAndQr === true,
    photoVideo: input?.photoVideo === true,
    publicIdentification: input?.publicIdentification === true,
    safetyAndVenue: input?.safetyAndVenue === true
  };
  if (Object.values(permissions).some(value => !value)) {
    throw new AppError(400, 'PARTNER_TERMS_REQUIRED', 'Accept all Partner Pass activation requirements.');
  }
  return permissions;
}

export function partnerClaimId() {
  return randomBytes(12).toString('base64url');
}

export function partnerAlreadyRedeemed(records, partnerCode, now = new Date()) {
  return partnerRedemptionStatus(records, partnerCode, now) !== 'available';
}

export function partnerRedemptionStatus(records, partnerCode, now = new Date()) {
  const completed = records.some(record => record.recordType === 'PARTNER_REDEMPTION_COMPLETED' && record.partnerCode === partnerCode);
  if (completed) return 'redeemed';
  const released = new Set(records.filter(record => record.recordType === 'PARTNER_REDEMPTION_RELEASED').map(record => record.claimId));
  const claimed = records.some(record => record.recordType === 'PARTNER_REDEMPTION_CLAIM'
    && record.partnerCode === partnerCode && !released.has(record.claimId)
    && Date.parse(record.expiresAt) > now.getTime());
  return claimed ? 'claimed' : 'available';
}
