import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINIMUM_NOTICE_HOURS, PACKAGES, PAYMENT_TTL_MINUTES, loadConfig } from './config.js';
import { AppError } from './errors.js';
import { createSquareService } from './square.js';
import {
  applyCoupon, applyNewCustomerOffer,
  buildCustomerNote,
  calculatePricing,
  createConfirmationToken,
  createReservationId,
  findAvailableSlot,
  normalizeCouponCode,
  normalizeModifierSelections,
  persistReservation,
  readReservationRecords,
  validateReservation
} from './reservations.js';
import { paymentEventRecord, verifySquareWebhook } from './webhooks.js';
import QRCode from 'qrcode';
import {
  applyPartnerPass, applyPartnerRate, campaignBookingUrl, normalizePartnerPermissions, partnerClaimId,
  partnerRedemptionStatus, publicCampaign, publicPartner, resolveCampaign, resolvePartner, validatePartnerVenue
} from './partners.js';
import {
  localCustomerHasCompletedBooking, newCustomerOfferClaimId, newCustomerOfferStatus,
  normalizeOfferContact, offerContactKey
} from './campaigns.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8'
};

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(body);
}

function sendSvg(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) throw new AppError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  }
  return body;
}

function parseJson(body) {
  try { return body ? JSON.parse(body) : {}; }
  catch (_) { throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.'); }
}

async function readJson(request) {
  return parseJson(await readBody(request));
}

function publicConfig(config) {
  return {
    ready: config.squareConfigured && config.squareWebPaymentsConfigured,
    webPaymentsReady: config.squareConfigured && config.squareWebPaymentsConfigured,
    applePayReady: config.squareConfigured && config.squareWebPaymentsConfigured,
    googlePayReady: config.squareConfigured && config.squareWebPaymentsConfigured,
    environment: config.squareEnvironment,
    applicationId: config.squareApplicationId,
    locationId: config.squareLocationId,
    webPaymentsSdkUrl: config.squareEnvironment === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js',
    minimumNoticeHours: MINIMUM_NOTICE_HOURS,
    paymentTtlMinutes: PAYMENT_TTL_MINUTES,
    packages: Object.values(PACKAGES).map(pkg => ({ hours: pkg.hours, price: pkg.price }))
  };
}

function createRateLimiter() {
  const buckets = new Map();
  return function allow(key, limit) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= 60_000) {
      buckets.set(key, { startedAt: now, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  };
}

function resolveCoupon(config, code) {
  if (!code) return null;
  const coupon = config.coupons.get(code);
  if (!coupon) throw new AppError(400, 'COUPON_NOT_RECOGNIZED', 'That coupon code is not recognized.');
  return coupon;
}

function pricingWithPaidAmount(pricing, amountMoney) {
  const paidCents = Number(amountMoney?.amount);
  const currency = typeof amountMoney?.currency === 'string' ? amountMoney.currency : pricing.currency;
  if (!Number.isSafeInteger(paidCents) || paidCents < 0 || currency !== pricing.currency) return pricing;
  const estimatedCents = Math.round(pricing.total * 100);
  const adjustmentCents = paidCents - estimatedCents;
  return {
    ...pricing,
    total: paidCents / 100,
    ...(adjustmentCents ? { squareAdjustment: { amount: adjustmentCents / 100 } } : {})
  };
}

async function serveStatic(requestPath, response) {
  const relative = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath).replace(/^\/+/, '');
  const topLevel = relative.split('/')[0];
  const privatePaths = new Set(['data', 'scripts', 'server', 'test']);
  const privateFiles = new Set(['package.json', 'package-lock.json', 'server.js']);
  if (privatePaths.has(topLevel) || privateFiles.has(relative) || relative.startsWith('.env')) return false;
  const requested = path.resolve(rootDir, relative.endsWith('/') ? `${relative}index.html` : relative);
  if (!requested.startsWith(`${rootDir}${path.sep}`)) return false;
  try {
    const info = await stat(requested);
    if (!info.isFile()) return false;
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(requested)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': requested.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'
    });
    createReadStream(requested).pipe(response);
    return true;
  } catch (_) { return false; }
}

export function createApp({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = loadConfig(env);
  const square = createSquareService(config, fetchImpl);
  const allowRequest = createRateLimiter();

  async function checkNewCustomerEligibility(contact, records) {
    const contactKey = offerContactKey(contact);
    if (newCustomerOfferStatus(records, contactKey) !== 'available' || localCustomerHasCompletedBooking(records, contact)) {
      return { eligible: false, contactKey };
    }
    const customers = await square.findCustomersByContact(contact);
    const hasCompletedOrders = await square.customersHaveCompletedOrders(customers.map(customer => customer.id));
    return { eligible: !hasCompletedOrders, contactKey };
  }

  return async function app(request, response) {
    const origin = request.headers.origin;
    const corsHeaders = origin === config.allowedOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (origin && origin !== config.allowedOrigin) return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed.' } });
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...corsHeaders, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      return response.end();
    }

    const url = new URL(request.url, config.appBaseUrl);
    const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
    const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';

    try {
      if (request.method === 'GET' && pathname === '/health') {
        return sendJson(response, 200, {
          ok: true,
          squareConfigured: config.squareConfigured,
          squareWebhookConfigured: config.squareWebhookConfigured,
          environment: config.squareEnvironment
        }, corsHeaders);
      }
      if (request.method === 'GET' && pathname === '/config') {
        return sendJson(response, 200, publicConfig(config), corsHeaders);
      }
      if (request.method === 'GET' && pathname === '/packages') {
        if (!allowRequest(`${ip}:packages`, 60)) throw new AppError(429, 'RATE_LIMITED', 'Too many package requests.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square Sandbox credentials are not configured yet.');
        const packages = await square.getPackages();
        return sendJson(response, 200, {
          packages: packages.map(pkg => ({
            durationHours: pkg.durationHours,
            itemName: pkg.itemName,
            basePrice: pkg.basePrice,
            currency: pkg.currency
          }))
        }, corsHeaders);
      }
      const partnerMatch = pathname.match(/^\/partners\/([A-Za-z0-9_-]{22,128})$/);
      if (request.method === 'GET' && partnerMatch) {
        if (!allowRequest(`${ip}:partner-pass`, 30)) throw new AppError(429, 'RATE_LIMITED', 'Too many Partner Pass requests.');
        const partner = resolvePartner(config.partners, partnerMatch[1]);
        const records = await readReservationRecords(config.dataDir);
        return sendJson(response, 200, { partner: publicPartner(partner, partnerRedemptionStatus(records, partner.code)) }, corsHeaders);
      }
      const partnerQrMatch = pathname.match(/^\/partners\/([A-Za-z0-9_-]{22,128})\/qr\.svg$/);
      if (request.method === 'GET' && partnerQrMatch) {
        if (!allowRequest(`${ip}:partner-qr`, 30)) throw new AppError(429, 'RATE_LIMITED', 'Too many QR requests.');
        const partner = resolvePartner(config.partners, partnerQrMatch[1]);
        const campaign = resolveCampaign(config.partners, partner.qrCampaignId);
        const svg = await QRCode.toString(campaignBookingUrl(config.appBaseUrl, campaign), { type: 'svg', margin: 2, width: 512, errorCorrectionLevel: 'M' });
        return sendSvg(response, 200, svg);
      }
      const campaignMatch = pathname.match(/^\/campaigns\/([A-Za-z0-9_.:-]{3,100})$/);
      if (request.method === 'GET' && campaignMatch) {
        if (!allowRequest(`${ip}:campaign`, 60)) throw new AppError(429, 'RATE_LIMITED', 'Too many campaign requests.');
        return sendJson(response, 200, { campaign: publicCampaign(resolveCampaign(config.partners, campaignMatch[1])) }, corsHeaders);
      }
      const campaignEligibilityMatch = pathname.match(/^\/campaigns\/([A-Za-z0-9_.:-]{3,100})\/eligibility$/);
      if (request.method === 'POST' && campaignEligibilityMatch) {
        if (!allowRequest(`${ip}:campaign-eligibility`, 12)) throw new AppError(429, 'RATE_LIMITED', 'Too many eligibility checks.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square is not configured yet.');
        const campaign = resolveCampaign(config.partners, campaignEligibilityMatch[1]);
        const contact = normalizeOfferContact(await readJson(request));
        const result = await checkNewCustomerEligibility(contact, await readReservationRecords(config.dataDir));
        return sendJson(response, 200, {
          eligible: result.eligible,
          campaign: publicCampaign(campaign),
          message: result.eligible
            ? `${campaign.discountPercent}% new customer offer verified.`
            : 'This offer is limited to customers without a previous completed BoomBoxCar purchase.'
        }, corsHeaders);
      }
      const confirmationMatch = pathname.match(/^\/confirmations\/(BBC-\d{4}-[A-F0-9]{6})$/);
      if (request.method === 'GET' && confirmationMatch) {
        if (!allowRequest(`${ip}:confirmation`, 60)) throw new AppError(429, 'RATE_LIMITED', 'Too many confirmation requests.');
        const reservationId = confirmationMatch[1];
        const confirmationToken = url.searchParams.get('token') || '';
        if (!/^[A-Za-z0-9_-]{32}$/.test(confirmationToken)) {
          throw new AppError(404, 'CONFIRMATION_NOT_FOUND', 'Confirmation not found.');
        }
        const records = await readReservationRecords(config.dataDir);
        const reservationRecord = records.find(record =>
          record.reservationId === reservationId && record.confirmationToken === confirmationToken && record.reservation && record.pricing);
        if (!reservationRecord) throw new AppError(404, 'CONFIRMATION_NOT_FOUND', 'Confirmation not found.');

        let completedRecord = [...records].reverse().find(record => record.reservationId === reservationId
          && ['PAYMENT_EVENT', 'PAYMENT_RECONCILIATION', 'PARTNER_REDEMPTION_COMPLETED'].includes(record.recordType)
          && record.paymentStatus === 'COMPLETED');
        const expiredRecord = [...records].reverse().find(record => record.reservationId === reservationId
          && record.recordType === 'PAYMENT_EXPIRATION' && record.paymentStatus === 'EXPIRED');
        let paymentStatus = completedRecord ? 'COMPLETED' : expiredRecord ? 'EXPIRED' : 'PENDING';
        let squareOrder = null;
        if (paymentStatus === 'PENDING' && config.squareConfigured) {
          squareOrder = await square.retrieveOrder(reservationRecord.squareOrderId);
          if (squareOrder?.state === 'COMPLETED') {
            paymentStatus = 'COMPLETED';
            completedRecord = {
              recordType: 'PAYMENT_RECONCILIATION',
              reservationId,
              recordedAt: new Date().toISOString(),
              squareOrderId: reservationRecord.squareOrderId,
              paymentStatus,
              amountMoney: squareOrder.total_money || null
            };
            await persistReservation(config.dataDir, completedRecord);
          } else if (squareOrder?.state === 'CANCELED') {
            paymentStatus = 'EXPIRED';
          }
        }
        if (paymentStatus === 'PENDING') throw new AppError(409, 'PAYMENT_PENDING', 'Square is still confirming the payment. Try again shortly.');
        if (paymentStatus === 'EXPIRED') throw new AppError(410, 'RESERVATION_EXPIRED', 'This unpaid reservation expired.');

        if (paymentStatus === 'COMPLETED' && !completedRecord?.amountMoney && config.squareConfigured) {
          try {
            squareOrder ||= await square.retrieveOrder(reservationRecord.squareOrderId);
            if (squareOrder?.total_money) {
              completedRecord = { ...completedRecord, amountMoney: squareOrder.total_money };
              await persistReservation(config.dataDir, {
                recordType: 'PAYMENT_RECONCILIATION',
                reservationId,
                recordedAt: new Date().toISOString(),
                squareOrderId: reservationRecord.squareOrderId,
                paymentStatus,
                amountMoney: squareOrder.total_money
              });
            }
          } catch (error) {
            console.error('[boomboxcar-api] confirmation amount reconciliation', error.code || error.name, error.message);
          }
        }
        return sendJson(response, 200, {
          reservationId,
          confirmedAt: completedRecord?.eventCreatedAt || completedRecord?.recordedAt || new Date().toISOString(),
          createdAt: reservationRecord.createdAt,
          paymentStatus,
          bookingStatus: reservationRecord.bookingStatus,
          squareBookingId: reservationRecord.squareBookingId,
          squareOrderId: reservationRecord.squareOrderId,
          paymentMethod: reservationRecord.paymentMethod,
          receiptUrl: completedRecord?.receiptUrl || null,
          reservation: reservationRecord.reservation,
          pricing: pricingWithPaidAmount(reservationRecord.pricing, completedRecord?.amountMoney),
          partner: reservationRecord.partner || null,
          campaign: reservationRecord.campaign || null
        }, corsHeaders);
      }
      if (request.method === 'POST' && pathname === '/webhooks/square') {
        if (!allowRequest(`${ip}:square-webhook`, 240)) throw new AppError(429, 'RATE_LIMITED', 'Too many webhook requests.');
        if (!config.squareWebhookConfigured) throw new AppError(503, 'SQUARE_WEBHOOK_NOT_CONFIGURED', 'Square webhook verification is not configured.');
        const body = await readBody(request);
        const signature = String(request.headers['x-square-hmacsha256-signature'] || '');
        const verified = verifySquareWebhook({
          body,
          notificationUrl: config.squareWebhookNotificationUrl,
          signature,
          signatureKey: config.squareWebhookSignatureKey
        });
        if (!verified) throw new AppError(403, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid.');
        const event = parseJson(body);
        const paymentRecord = paymentEventRecord(event);
        if (paymentRecord) await persistReservation(config.dataDir, paymentRecord);
        return sendJson(response, 200, { received: true, recorded: Boolean(paymentRecord) });
      }
      if (request.method === 'GET' && pathname === '/modifiers') {
        if (!allowRequest(`${ip}:catalog`, 120)) throw new AppError(429, 'RATE_LIMITED', 'Too many catalog requests.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square Sandbox credentials are not configured yet.');
        const durationHours = Number(url.searchParams.get('durationHours'));
        if (!PACKAGES[durationHours]) throw new AppError(400, 'INVALID_DURATION', 'Choose a valid duration.');
        const packageDetails = await square.getPackage(durationHours);
        return sendJson(response, 200, packageDetails, corsHeaders);
      }
      if (request.method === 'POST' && pathname === '/availability') {
        if (!allowRequest(`${ip}:availability`, 60)) throw new AppError(429, 'RATE_LIMITED', 'Too many availability requests.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square Sandbox credentials are not configured yet.');
        const input = await readJson(request);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !PACKAGES[Number(input.durationHours)]) {
          throw new AppError(400, 'INVALID_AVAILABILITY_REQUEST', 'Choose a valid date and duration.');
        }
        const slots = await square.searchAvailability({ date: input.date, durationHours: Number(input.durationHours), locale: input.locale });
        return sendJson(response, 200, { date: input.date, durationHours: Number(input.durationHours), slots }, corsHeaders);
      }
      if (request.method === 'POST' && pathname === '/coupons/validate') {
        if (!allowRequest(`${ip}:coupons`, 20)) throw new AppError(429, 'RATE_LIMITED', 'Too many coupon attempts.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square credentials are not configured yet.');
        const input = await readJson(request);
        const durationHours = Number(input.durationHours);
        if (!PACKAGES[durationHours]) throw new AppError(400, 'INVALID_DURATION', 'Choose a valid duration.');
        const couponCode = normalizeCouponCode(input.couponCode);
        if (!couponCode) throw new AppError(400, 'INVALID_COUPON', 'Enter a coupon code.');
        const selections = normalizeModifierSelections(input.modifiers);
        const coupon = resolveCoupon(config, couponCode);
        const packageDetails = await square.getPackage(durationHours);
        const pricing = applyCoupon(
          calculatePricing(packageDetails, selections),
          coupon
        );
        return sendJson(response, 200, { coupon: pricing.discount, pricing }, corsHeaders);
      }
      if (request.method === 'POST' && (pathname === '/reservations/payment' || pathname === '/reservations/apple-pay')) {
        if (!allowRequest(`${ip}:payment`, 10)) throw new AppError(429, 'RATE_LIMITED', 'Too many payment attempts.');
        if (!config.squareConfigured || !config.squareWebPaymentsConfigured) {
          throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square payments are not configured yet.');
        }
        const input = await readJson(request);
        const paymentMethod = pathname === '/reservations/apple-pay' ? 'applePay' : input.paymentMethod;
        if (!['card', 'applePay', 'googlePay'].includes(paymentMethod)) {
          throw new AppError(400, 'INVALID_PAYMENT_METHOD', 'Choose a valid payment method.');
        }
        const paymentLabel = paymentMethod === 'applePay'
          ? 'Apple Pay'
          : paymentMethod === 'googlePay' ? 'Google Pay' : 'Card payment';
        const sourceToken = typeof input.sourceToken === 'string' ? input.sourceToken.trim() : '';
        if (!sourceToken || sourceToken.length > 2048 || /[\s\x00-\x1F]/.test(sourceToken)) {
          throw new AppError(400, 'INVALID_PAYMENT_TOKEN', `${paymentLabel} did not return a valid payment token.`);
        }
        const expectedTotalCents = Number(input.expectedTotalCents);
        if (!Number.isSafeInteger(expectedTotalCents) || expectedTotalCents < 0) {
          throw new AppError(400, 'INVALID_EXPECTED_TOTAL', 'The displayed payment total is invalid.');
        }
        const reservation = validateReservation(input);
        const partner = input.partnerToken ? resolvePartner(config.partners, input.partnerToken) : null;
        const campaign = input.campaignId ? resolveCampaign(config.partners, input.campaignId) : null;
        if (partner && reservation.couponCode) throw new AppError(400, 'PARTNER_COUPON_NOT_ALLOWED', 'Coupons cannot be combined with a Partner Pass.');
        if (campaign && (partner || reservation.couponCode || reservation.attribution.qrCampaignId !== campaign.id)) {
          throw new AppError(400, 'CAMPAIGN_NOT_ELIGIBLE', 'This event offer cannot be combined with another offer.');
        }
        let partnerStatus = null;
        if (partner) {
          validatePartnerVenue(partner, reservation.details.address);
          partnerStatus = partnerRedemptionStatus(await readReservationRecords(config.dataDir), partner.code);
          if (partnerStatus === 'claimed') throw new AppError(409, 'PARTNER_PASS_PROCESSING', 'The complimentary activation is currently being processed. Try again shortly.');
        }
        let campaignContact = null;
        if (campaign) {
          campaignContact = normalizeOfferContact(reservation.customer);
          const eligibility = await checkNewCustomerEligibility(campaignContact, await readReservationRecords(config.dataDir));
          if (!eligibility.eligible) throw new AppError(409, 'NEW_CUSTOMER_OFFER_NOT_ELIGIBLE', `This ${campaign.discountPercent}% offer is limited to customers without a previous completed BoomBoxCar purchase.`);
        }
        const coupon = resolveCoupon(config, reservation.couponCode);
        const packageDetails = await square.getPackage(reservation.durationHours);
        let pricing = applyCoupon(
          calculatePricing(packageDetails, reservation.modifiers),
          coupon
        );
        if (partner) pricing = partnerStatus === 'available'
          ? applyPartnerPass(pricing, partner, reservation.durationHours)
          : applyPartnerRate(pricing, partner);
        if (campaign) pricing = applyNewCustomerOffer(pricing, campaign);
        if (Math.round(pricing.total * 100) !== expectedTotalCents) {
          throw new AppError(409, 'PRICE_CHANGED', 'Square pricing changed. Review the updated total and try payment again.');
        }
        const availableSlots = await square.searchAvailability({
          date: reservation.eventDate,
          durationHours: reservation.durationHours,
          locale: reservation.locale
        });
        const slot = findAvailableSlot(availableSlots, reservation.startAt);
        if (!slot) throw new AppError(409, 'SLOT_NO_LONGER_AVAILABLE', 'That arrival time is no longer available. Choose another time.');

        let claimId = null;
        let campaignClaimId = null;
        let campaignContactKey = null;
        if (partnerStatus === 'available') {
          normalizePartnerPermissions(input.partnerPermissions);
          const currentStatus = partnerRedemptionStatus(await readReservationRecords(config.dataDir), partner.code);
          if (currentStatus !== 'available') throw new AppError(409, 'PARTNER_PASS_PROCESSING', 'The complimentary activation is currently being processed. Try again shortly.');
          claimId = partnerClaimId();
          await persistReservation(config.dataDir, {
            recordType: 'PARTNER_REDEMPTION_CLAIM', claimId, partnerCode: partner.code,
            recordedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + PAYMENT_TTL_MINUTES * 60_000).toISOString()
          });
        }
        if (campaign) {
          const eligibility = await checkNewCustomerEligibility(campaignContact, await readReservationRecords(config.dataDir));
          if (!eligibility.eligible) throw new AppError(409, 'NEW_CUSTOMER_OFFER_NOT_ELIGIBLE', 'This new customer offer is no longer available.');
          campaignClaimId = newCustomerOfferClaimId();
          campaignContactKey = eligibility.contactKey;
          await persistReservation(config.dataDir, {
            recordType: 'NEW_CUSTOMER_OFFER_CLAIM', claimId: campaignClaimId, contactKey: campaignContactKey,
            campaignId: campaign.id, recordedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + PAYMENT_TTL_MINUTES * 60_000).toISOString()
          });
        }
        const reservationId = createReservationId();
        const confirmationToken = createConfirmationToken();
        const customerNote = buildCustomerNote({ reservationId, reservation, pricing, partner });
        let customer;
        let booking;
        try {
          customer = await square.findOrCreateCustomer(reservation.customer, reservationId);
          booking = await square.createBooking({
            customerId: customer.id,
            slot,
            customerNote,
            eventAddress: reservation.details.address
          });
        } catch (error) {
          if (claimId) await persistReservation(config.dataDir, { recordType: 'PARTNER_REDEMPTION_RELEASED', claimId, partnerCode: partner.code, recordedAt: new Date().toISOString() });
          if (campaignClaimId) await persistReservation(config.dataDir, { recordType: 'NEW_CUSTOMER_OFFER_RELEASED', claimId: campaignClaimId, contactKey: campaignContactKey, recordedAt: new Date().toISOString() });
          throw error;
        }
        const createdAt = new Date().toISOString();
        let order;
        let payment;
        try {
          order = await square.createOrder({
            customer: reservation.customer,
            customerId: customer.id,
            bookingId: booking.id,
            reservationId,
            eventAddress: reservation.details.address,
            packageDetails,
            modifiers: pricing.modifiers,
            discount: pricing.discount,
            partnerDiscount: pricing.partnerDiscount
          });
          await persistReservation(config.dataDir, {
            reservationId,
            confirmationToken,
            createdAt,
            squareEnvironment: config.squareEnvironment,
            squareBookingId: booking.id,
            bookingVersion: booking.version,
            squareOrderId: order.id,
            squareCustomerId: customer.id,
            bookingStatus: booking.status,
            paymentStatus: 'PROCESSING',
            paymentMethod,
            reservation,
            pricing,
            ...(partner ? { partner: { code: partner.code, name: partner.name, benefitType: pricing.partnerDiscount.benefitType, sourceReferralId: partner.sourceReferralId, qrCampaignId: partner.qrCampaignId } } : {}),
            ...(campaign ? { campaign: { id: campaign.id, sourceReferralId: campaign.sourceReferralId, discountPercent: campaign.discountPercent } } : {})
          });
          payment = await square.createPayment({
            sourceId: sourceToken,
            orderId: order.id,
            customerId: customer.id,
            reservationId,
            customer: reservation.customer,
            pricing
          });
        } catch (paymentError) {
          let canceledBooking = null;
          let cancellationError = null;
          try {
            canceledBooking = await square.cancelBooking(booking);
          } catch (error) {
            cancellationError = { code: error.code || 'BOOKING_CANCELLATION_FAILED', message: error.message };
            console.error('[boomboxcar-api] payment rollback', cancellationError.code, cancellationError.message);
          }
          await persistReservation(config.dataDir, {
            reservationId,
            createdAt: new Date().toISOString(),
            squareEnvironment: config.squareEnvironment,
            squareBookingId: booking.id,
            squareOrderId: order?.id || null,
            squareCustomerId: customer.id,
            bookingStatus: canceledBooking?.status || booking.status,
            paymentStatus: 'PAYMENT_FAILED',
            paymentMethod,
            paymentError: { code: paymentError.code || 'PAYMENT_FAILED', message: paymentError.message },
            cancellationError,
            reservation,
            pricing
          });
          if (claimId) await persistReservation(config.dataDir, { recordType: 'PARTNER_REDEMPTION_RELEASED', claimId, partnerCode: partner.code, recordedAt: new Date().toISOString() });
          if (campaignClaimId) await persistReservation(config.dataDir, { recordType: 'NEW_CUSTOMER_OFFER_RELEASED', claimId: campaignClaimId, contactKey: campaignContactKey, recordedAt: new Date().toISOString() });
          if (cancellationError) {
            throw new AppError(502, 'PAYMENT_FAILED_REVIEW_REQUIRED', 'Payment was not completed and the appointment could not be canceled automatically. Contact booking@boomboxcar.com before trying again.');
          }
          throw new AppError(paymentError.status || 502, 'PAYMENT_FAILED', 'Payment was not completed. The appointment was canceled, so you can safely try again.');
        }
        try {
          await persistReservation(config.dataDir, {
            recordType: 'PAYMENT_EVENT',
            eventCreatedAt: payment.created_at || createdAt,
            recordedAt: new Date().toISOString(),
            reservationId,
            squareOrderId: order.id,
            squarePaymentId: payment.id,
            paymentStatus: payment.status,
            paymentMethod,
            amountMoney: payment.amount_money || null,
            receiptUrl: payment.receipt_url || null
          });
        } catch (error) {
          console.error('[boomboxcar-api] payment completion log', error.code || error.name, error.message);
        }
        if (claimId) await persistReservation(config.dataDir, {
          recordType: 'PARTNER_REDEMPTION_COMPLETED', claimId, reservationId, recordedAt: new Date().toISOString(),
          paymentStatus: 'COMPLETED', partnerCode: partner.code, partnerName: partner.name,
          activationLength: reservation.durationHours, retailValueRedeemed: pricing.partnerDiscount.amount,
          activationDate: reservation.eventDate, eventType: reservation.details.eventType,
          bookedAddons: pricing.modifiers.filter(modifier => !modifier.included && modifier.price > 0),
          sourceReferralId: partner.sourceReferralId, qrCampaignId: partner.qrCampaignId
        });
        if (partner && !claimId) await persistReservation(config.dataDir, {
          recordType: 'PARTNER_RATE_BOOKING', reservationId, recordedAt: new Date().toISOString(),
          partnerCode: partner.code, partnerName: partner.name, discountPercent: partner.futureDiscountPercent,
          discountAmount: pricing.partnerDiscount.amount, activationDate: reservation.eventDate,
          eventType: reservation.details.eventType, bookedAddons: pricing.modifiers.filter(modifier => !modifier.included && modifier.price > 0),
          sourceReferralId: partner.sourceReferralId, qrCampaignId: partner.qrCampaignId
        });
        if (campaignClaimId) await persistReservation(config.dataDir, {
          recordType: 'NEW_CUSTOMER_OFFER_COMPLETED', claimId: campaignClaimId, contactKey: campaignContactKey,
          reservationId, recordedAt: new Date().toISOString(), paymentStatus: 'COMPLETED',
          campaignId: campaign.id, partnerCode: campaign.partnerCode, partnerName: campaign.partnerName,
          discountPercent: campaign.discountPercent, discountAmount: pricing.discount.amount,
          bookingDate: reservation.eventDate, eventType: reservation.details.eventType,
          bookedAddons: pricing.modifiers.filter(modifier => !modifier.included && modifier.price > 0),
          sourceReferralId: campaign.sourceReferralId, qrCampaignId: campaign.id
        });
        const confirmationUrl = new URL('/confirmation/', config.appBaseUrl);
        confirmationUrl.searchParams.set('reservation', reservationId);
        confirmationUrl.searchParams.set('token', confirmationToken);
        return sendJson(response, 201, {
          reservationId,
          bookingId: booking.id,
          orderId: order.id,
          paymentId: payment.id,
          paymentStatus: payment.status,
          paymentMethod,
          confirmationUrl: confirmationUrl.toString(),
          status: booking.status,
          startAt: booking.start_at,
          pricing
        }, corsHeaders);
      }

      const partnerReservationMatch = pathname.match(/^\/partners\/([A-Za-z0-9_-]{22,128})\/reservations$/);
      if (request.method === 'POST' && partnerReservationMatch) {
        if (!allowRequest(`${ip}:partner-reservation`, 6)) throw new AppError(429, 'RATE_LIMITED', 'Too many Partner Pass attempts.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square is not configured yet.');
        const partner = resolvePartner(config.partners, partnerReservationMatch[1]);
        const input = await readJson(request);
        const permissions = normalizePartnerPermissions(input.partnerPermissions);
        const reservation = validateReservation({ ...input, couponCode: '' });
        validatePartnerVenue(partner, reservation.details.address);
        const packageDetails = await square.getPackage(reservation.durationHours);
        const pricing = applyPartnerPass(calculatePricing(packageDetails, reservation.modifiers), partner, reservation.durationHours);
        if (Math.round(pricing.total * 100) !== 0) throw new AppError(409, 'PARTNER_PAYMENT_REQUIRED', 'Complete Square payment for the selected paid add-ons.');
        const records = await readReservationRecords(config.dataDir);
        if (partnerRedemptionStatus(records, partner.code) !== 'available') throw new AppError(409, 'PARTNER_PASS_REDEEMED', 'The complimentary Partner Pass has already been redeemed. Use the same partner page for the ongoing Partner Rate.');
        const availableSlots = await square.searchAvailability({ date: reservation.eventDate, durationHours: reservation.durationHours, locale: reservation.locale });
        const slot = findAvailableSlot(availableSlots, reservation.startAt);
        if (!slot) throw new AppError(409, 'SLOT_NO_LONGER_AVAILABLE', 'That arrival time is no longer available. Choose another time.');
        const claimId = partnerClaimId();
        await persistReservation(config.dataDir, {
          recordType: 'PARTNER_REDEMPTION_CLAIM', claimId, partnerCode: partner.code,
          recordedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + PAYMENT_TTL_MINUTES * 60_000).toISOString()
        });
        const reservationId = createReservationId();
        const confirmationToken = createConfirmationToken();
        let booking;
        try {
          const customer = await square.findOrCreateCustomer(reservation.customer, reservationId);
          booking = await square.createBooking({
            customerId: customer.id, slot,
            customerNote: buildCustomerNote({ reservationId, reservation, pricing, partner }),
            eventAddress: reservation.details.address
          });
          const order = await square.createOrder({
            customer: reservation.customer, customerId: customer.id, bookingId: booking.id, reservationId,
            eventAddress: reservation.details.address, packageDetails, modifiers: pricing.modifiers,
            partnerDiscount: pricing.partnerDiscount
          });
          const completedOrder = await square.payZeroOrder(order);
          const createdAt = new Date().toISOString();
          await persistReservation(config.dataDir, {
            reservationId, confirmationToken, createdAt, squareEnvironment: config.squareEnvironment,
            squareBookingId: booking.id, bookingVersion: booking.version, squareOrderId: order.id,
            squareCustomerId: customer.id, bookingStatus: booking.status, paymentStatus: 'COMPLETED',
            paymentMethod: 'partnerPass', reservation, pricing, partnerPermissions: permissions,
            partner: { code: partner.code, name: partner.name, benefitType: 'activation', sourceReferralId: partner.sourceReferralId, qrCampaignId: partner.qrCampaignId }
          });
          await persistReservation(config.dataDir, {
            recordType: 'PARTNER_REDEMPTION_COMPLETED', claimId, reservationId, recordedAt: createdAt,
            paymentStatus: 'COMPLETED', amountMoney: completedOrder.total_money || { amount: 0, currency: pricing.currency },
            partnerCode: partner.code, partnerName: partner.name, activationLength: reservation.durationHours,
            retailValueRedeemed: pricing.partnerDiscount.amount, activationDate: reservation.eventDate,
            eventType: reservation.details.eventType, bookedAddons: [], sourceReferralId: partner.sourceReferralId,
            qrCampaignId: partner.qrCampaignId
          });
          const confirmationUrl = new URL('/confirmation/', config.appBaseUrl);
          confirmationUrl.searchParams.set('reservation', reservationId);
          confirmationUrl.searchParams.set('token', confirmationToken);
          return sendJson(response, 201, { reservationId, bookingId: booking.id, orderId: order.id, paymentStatus: 'COMPLETED', paymentMethod: 'partnerPass', confirmationUrl: confirmationUrl.toString(), pricing }, corsHeaders);
        } catch (error) {
          if (booking) {
            try { await square.cancelBooking(booking); } catch (cancelError) { console.error('[boomboxcar-api] partner rollback', cancelError.code || cancelError.name, cancelError.message); }
          }
          await persistReservation(config.dataDir, { recordType: 'PARTNER_REDEMPTION_RELEASED', claimId, partnerCode: partner.code, recordedAt: new Date().toISOString() });
          throw error;
        }
      }

      if (config.nodeEnvironment !== 'production' && request.method === 'GET' && await serveStatic(url.pathname, response)) return;
      throw new AppError(404, 'NOT_FOUND', 'Route not found.');
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status >= 500 && error.code !== 'SQUARE_NOT_CONFIGURED') {
        console.error('[boomboxcar-api]', error.code || error.name, error.message);
      }
      return sendJson(response, status, {
        error: {
          code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
          message: status === 500 && config.nodeEnvironment === 'production' ? 'An unexpected server error occurred.' : error.message
        }
      }, corsHeaders);
    }
  };
}
