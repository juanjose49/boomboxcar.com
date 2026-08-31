import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';
import { eventAddressesMatch, formatEventAddress, normalizeEventAddress } from './addresses.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;
const RETAIL_VALUES = Object.freeze({ 2: 399, 3: 499, 4: 599 });
const DEFAULT_VALUE_CAP = 599;
const DEFAULT_FUTURE_DISCOUNT_PERCENT = 15;

function clean(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function parsePartners(value) {
  if (!value) return new Map();
  let entries;
  try { entries = JSON.parse(value); }
  catch (_) { return new Map(); }
  if (!Array.isArray(entries)) return new Map();
  const partners = new Map();
  for (const entry of entries) {
    const token = clean(entry?.token, 128);
    const code = clean(entry?.code, 40).toUpperCase();
    const name = clean(entry?.name, 120);
    const maxHours = Number(entry?.maxHours ?? 2);
    const valueCap = Number(entry?.valueCap ?? DEFAULT_VALUE_CAP);
    const futureDiscountPercent = Number(entry?.futureDiscountPercent ?? DEFAULT_FUTURE_DISCOUNT_PERCENT);
    let venueAddress;
    try { venueAddress = normalizeEventAddress(entry?.venueAddress); }
    catch (_) { continue; }
    const expiresOn = clean(entry?.expiresOn, 10);
    const newCustomerDiscountPercent = Number(entry?.newCustomerDiscountPercent ?? 10);
    const newCustomerOfferEndsOn = clean(entry?.newCustomerOfferEndsOn, 10);
    if (!TOKEN_PATTERN.test(token) || !CODE_PATTERN.test(code) || !name || ![2, 3, 4].includes(maxHours)
      || !Number.isFinite(valueCap) || valueCap <= 0 || valueCap > DEFAULT_VALUE_CAP) continue;
    if (!Number.isFinite(futureDiscountPercent) || futureDiscountPercent <= 0 || futureDiscountPercent > 50) continue;
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) continue;
    if (!Number.isFinite(newCustomerDiscountPercent) || newCustomerDiscountPercent <= 0 || newCustomerDiscountPercent > 50) continue;
    if (newCustomerOfferEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(newCustomerOfferEndsOn)) continue;
    partners.set(token, Object.freeze({
      token, code, name, maxHours, valueCap: Math.round(valueCap * 100) / 100,
      futureDiscountPercent: Math.round(futureDiscountPercent * 100) / 100, venueAddress: Object.freeze(venueAddress), expiresOn,
      newCustomerDiscountPercent: Math.round(newCustomerDiscountPercent * 100) / 100,
      newCustomerOfferEndsOn,
      active: entry.active !== false,
      sourceReferralId: clean(entry.sourceReferralId || code, 100),
      qrCampaignId: clean(entry.qrCampaignId || `${code}-ACTIVATION`, 100)
    }));
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
    eligibleDurations: [2, 3, 4].filter(hours => hours <= partner.maxHours),
    retailValues: Object.fromEntries(Object.entries(RETAIL_VALUES).filter(([hours]) => Number(hours) <= partner.maxHours)),
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
  url.hash = 'campaignOffer';
  return url.toString();
}

export function applyPartnerPass(pricing, partner, durationHours) {
  if (![2, 3, 4].includes(durationHours) || durationHours > partner.maxHours) {
    throw new AppError(400, 'PARTNER_DURATION_NOT_ELIGIBLE', `This Partner Pass covers up to ${partner.maxHours} hours.`);
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
