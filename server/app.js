import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINIMUM_NOTICE_HOURS, PACKAGES, PAYMENT_TTL_MINUTES, loadConfig } from './config.js';
import { AppError } from './errors.js';
import { createSquareService } from './square.js';
import {
  applyCoupon,
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

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8'
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
    ready: config.squareConfigured,
    applePayReady: config.squareConfigured && config.squareWebPaymentsConfigured,
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

        const completedRecord = [...records].reverse().find(record => record.reservationId === reservationId
          && ['PAYMENT_EVENT', 'PAYMENT_RECONCILIATION'].includes(record.recordType)
          && record.paymentStatus === 'COMPLETED');
        const expiredRecord = [...records].reverse().find(record => record.reservationId === reservationId
          && record.recordType === 'PAYMENT_EXPIRATION' && record.paymentStatus === 'EXPIRED');
        let paymentStatus = completedRecord ? 'COMPLETED' : expiredRecord ? 'EXPIRED' : 'PENDING';
        if (paymentStatus === 'PENDING' && config.squareConfigured) {
          const order = await square.retrieveOrder(reservationRecord.squareOrderId);
          if (order?.state === 'COMPLETED') {
            paymentStatus = 'COMPLETED';
            await persistReservation(config.dataDir, {
              recordType: 'PAYMENT_RECONCILIATION',
              reservationId,
              recordedAt: new Date().toISOString(),
              squareOrderId: reservationRecord.squareOrderId,
              paymentStatus
            });
          } else if (order?.state === 'CANCELED') {
            paymentStatus = 'EXPIRED';
          }
        }
        if (paymentStatus === 'PENDING') throw new AppError(409, 'PAYMENT_PENDING', 'Square is still confirming the payment. Try again shortly.');
        if (paymentStatus === 'EXPIRED') throw new AppError(410, 'RESERVATION_EXPIRED', 'This unpaid reservation expired.');

        return sendJson(response, 200, {
          reservationId,
          confirmedAt: completedRecord?.eventCreatedAt || completedRecord?.recordedAt || new Date().toISOString(),
          createdAt: reservationRecord.createdAt,
          paymentStatus,
          bookingStatus: reservationRecord.bookingStatus,
          squareBookingId: reservationRecord.squareBookingId,
          squareOrderId: reservationRecord.squareOrderId,
          receiptUrl: completedRecord?.receiptUrl || null,
          reservation: reservationRecord.reservation,
          pricing: reservationRecord.pricing
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
      if (request.method === 'POST' && pathname === '/reservations') {
        if (!allowRequest(`${ip}:reservations`, 10)) throw new AppError(429, 'RATE_LIMITED', 'Too many reservation attempts.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square Sandbox credentials are not configured yet.');
        const reservation = validateReservation(await readJson(request));
        const coupon = resolveCoupon(config, reservation.couponCode);
        const packageDetails = await square.getPackage(reservation.durationHours);
        const pricing = applyCoupon(
          calculatePricing(packageDetails, reservation.modifiers),
          coupon
        );
        const availableSlots = await square.searchAvailability({
          date: reservation.eventDate,
          durationHours: reservation.durationHours,
          locale: reservation.locale
        });
        const slot = findAvailableSlot(availableSlots, reservation.startAt);
        if (!slot) throw new AppError(409, 'SLOT_NO_LONGER_AVAILABLE', 'That arrival time is no longer available. Choose another time.');

        const reservationId = createReservationId();
        const confirmationToken = createConfirmationToken();
        const customerNote = buildCustomerNote({ reservationId, reservation, pricing });
        const customer = await square.findOrCreateCustomer(reservation.customer, reservationId);
        const booking = await square.createBooking({
          customerId: customer.id,
          slot,
          customerNote,
          eventAddress: reservation.details.address
        });
        let paymentLink;
        try {
          paymentLink = await square.createPaymentLink({
            customer: reservation.customer,
            customerId: customer.id,
            bookingId: booking.id,
            reservationId,
            confirmationToken,
            eventAddress: reservation.details.address,
            packageDetails,
            modifiers: pricing.modifiers,
            discount: pricing.discount
          });
        } catch (checkoutError) {
          let canceledBooking = null;
          let cancellationError = null;
          try {
            canceledBooking = await square.cancelBooking(booking);
          } catch (error) {
            cancellationError = { code: error.code || 'BOOKING_CANCELLATION_FAILED', message: error.message };
            console.error('[boomboxcar-api] checkout rollback', cancellationError.code, cancellationError.message);
          }
          await persistReservation(config.dataDir, {
            reservationId,
            createdAt: new Date().toISOString(),
            squareEnvironment: config.squareEnvironment,
            squareBookingId: booking.id,
            squareCustomerId: customer.id,
            bookingStatus: canceledBooking?.status || booking.status,
            paymentStatus: 'CHECKOUT_CREATION_FAILED',
            checkoutError: { code: checkoutError.code || 'PAYMENT_SETUP_FAILED', message: checkoutError.message },
            cancellationError,
            reservation,
            pricing
          });
          if (cancellationError) {
            throw new AppError(502, 'PAYMENT_SETUP_FAILED_REVIEW_REQUIRED', 'The appointment was created, but payment setup failed. Contact booking@boomboxcar.com before trying again.');
          }
          throw new AppError(checkoutError.status || 502, 'PAYMENT_SETUP_FAILED', 'Square checkout could not be started. The appointment was canceled, so you can safely try again.');
        }
        const paymentExpiresAt = new Date(Date.now() + PAYMENT_TTL_MINUTES * 60 * 1000).toISOString();
        await persistReservation(config.dataDir, {
          reservationId,
          confirmationToken,
          createdAt: new Date().toISOString(),
          expiresAt: paymentExpiresAt,
          squareEnvironment: config.squareEnvironment,
          squareBookingId: booking.id,
          bookingVersion: booking.version,
          squarePaymentLinkId: paymentLink.id,
          squareOrderId: paymentLink.order_id,
          squareCustomerId: customer.id,
          bookingStatus: booking.status,
          paymentStatus: 'PENDING',
          reservation,
          pricing
        });
        return sendJson(response, 201, {
          reservationId,
          bookingId: booking.id,
          paymentLinkId: paymentLink.id,
          orderId: paymentLink.order_id,
          checkoutUrl: paymentLink.url,
          paymentStatus: 'PENDING',
          paymentExpiresAt,
          status: booking.status,
          startAt: booking.start_at,
          pricing
        }, corsHeaders);
      }
      if (request.method === 'POST' && pathname === '/reservations/apple-pay') {
        if (!allowRequest(`${ip}:apple-pay`, 10)) throw new AppError(429, 'RATE_LIMITED', 'Too many payment attempts.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square credentials are not configured yet.');
        const input = await readJson(request);
        const sourceToken = typeof input.sourceToken === 'string' ? input.sourceToken.trim() : '';
        if (!sourceToken || sourceToken.length > 2048 || /[\s\x00-\x1F]/.test(sourceToken)) {
          throw new AppError(400, 'INVALID_PAYMENT_TOKEN', 'Apple Pay did not return a valid payment token.');
        }
        const expectedTotalCents = Number(input.expectedTotalCents);
        if (!Number.isSafeInteger(expectedTotalCents) || expectedTotalCents < 0) {
          throw new AppError(400, 'INVALID_EXPECTED_TOTAL', 'The displayed payment total is invalid.');
        }
        const reservation = validateReservation(input);
        const coupon = resolveCoupon(config, reservation.couponCode);
        const packageDetails = await square.getPackage(reservation.durationHours);
        const pricing = applyCoupon(
          calculatePricing(packageDetails, reservation.modifiers),
          coupon
        );
        if (Math.round(pricing.total * 100) !== expectedTotalCents) {
          throw new AppError(409, 'PRICE_CHANGED', 'Square pricing changed. Review the updated total and try Apple Pay again.');
        }
        const availableSlots = await square.searchAvailability({
          date: reservation.eventDate,
          durationHours: reservation.durationHours,
          locale: reservation.locale
        });
        const slot = findAvailableSlot(availableSlots, reservation.startAt);
        if (!slot) throw new AppError(409, 'SLOT_NO_LONGER_AVAILABLE', 'That arrival time is no longer available. Choose another time.');

        const reservationId = createReservationId();
        const confirmationToken = createConfirmationToken();
        const customerNote = buildCustomerNote({ reservationId, reservation, pricing });
        const customer = await square.findOrCreateCustomer(reservation.customer, reservationId);
        const booking = await square.createBooking({
          customerId: customer.id,
          slot,
          customerNote,
          eventAddress: reservation.details.address
        });
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
            discount: pricing.discount
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
            reservation,
            pricing
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
            console.error('[boomboxcar-api] Apple Pay rollback', cancellationError.code, cancellationError.message);
          }
          await persistReservation(config.dataDir, {
            reservationId,
            createdAt: new Date().toISOString(),
            squareEnvironment: config.squareEnvironment,
            squareBookingId: booking.id,
            squareOrderId: order?.id || null,
            squareCustomerId: customer.id,
            bookingStatus: canceledBooking?.status || booking.status,
            paymentStatus: 'APPLE_PAY_FAILED',
            paymentError: { code: paymentError.code || 'PAYMENT_FAILED', message: paymentError.message },
            cancellationError,
            reservation,
            pricing
          });
          if (cancellationError) {
            throw new AppError(502, 'APPLE_PAY_FAILED_REVIEW_REQUIRED', 'Payment was not completed and the appointment could not be canceled automatically. Contact booking@boomboxcar.com before trying again.');
          }
          throw new AppError(paymentError.status || 502, 'APPLE_PAY_FAILED', 'Apple Pay was not completed. The appointment was canceled, so you can safely try again.');
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
            receiptUrl: payment.receipt_url || null
          });
        } catch (error) {
          console.error('[boomboxcar-api] Apple Pay completion log', error.code || error.name, error.message);
        }
        const confirmationUrl = new URL('/confirmation/', config.appBaseUrl);
        confirmationUrl.searchParams.set('reservation', reservationId);
        confirmationUrl.searchParams.set('token', confirmationToken);
        return sendJson(response, 201, {
          reservationId,
          bookingId: booking.id,
          orderId: order.id,
          paymentId: payment.id,
          paymentStatus: payment.status,
          confirmationUrl: confirmationUrl.toString(),
          status: booking.status,
          startAt: booking.start_at,
          pricing
        }, corsHeaders);
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
