import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADDONS, MINIMUM_NOTICE_HOURS, PACKAGES, loadConfig } from './config.js';
import { AppError } from './errors.js';
import { createSquareService } from './square.js';
import {
  buildCustomerNote,
  calculatePricing,
  createReservationId,
  persistReservation,
  validateReservation
} from './reservations.js';

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

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) throw new AppError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  }
  try { return body ? JSON.parse(body) : {}; }
  catch (_) { throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.'); }
}

function publicConfig(config) {
  return {
    ready: config.squareConfigured,
    environment: config.squareEnvironment,
    applicationId: config.squareApplicationId,
    locationId: config.squareLocationId,
    minimumNoticeHours: MINIMUM_NOTICE_HOURS,
    packages: Object.values(PACKAGES).map(pkg => ({ hours: pkg.hours, price: pkg.price })),
    addons: Object.entries(ADDONS).map(([key, addon]) => ({ key, name: addon.name, price: addon.price }))
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
        return sendJson(response, 200, { ok: true, squareConfigured: config.squareConfigured, environment: config.squareEnvironment }, corsHeaders);
      }
      if (request.method === 'GET' && pathname === '/config') {
        return sendJson(response, 200, publicConfig(config), corsHeaders);
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
      if (request.method === 'POST' && pathname === '/reservations') {
        if (!allowRequest(`${ip}:reservations`, 10)) throw new AppError(429, 'RATE_LIMITED', 'Too many reservation attempts.');
        if (!config.squareConfigured) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square Sandbox credentials are not configured yet.');
        const reservation = validateReservation(await readJson(request));
        const availableSlots = await square.searchAvailability({
          date: reservation.eventDate,
          durationHours: reservation.durationHours,
          locale: reservation.locale
        });
        const slot = availableSlots.find(candidate => candidate.startAt === reservation.startAt);
        if (!slot) throw new AppError(409, 'SLOT_NO_LONGER_AVAILABLE', 'That arrival time is no longer available. Choose another time.');

        const reservationId = createReservationId();
        const pricing = calculatePricing(reservation.durationHours, reservation.addonKeys);
        const customerNote = buildCustomerNote({ reservationId, reservation, pricing });
        const customer = await square.findOrCreateCustomer(reservation.customer, reservationId);
        const booking = await square.createBooking({ customerId: customer.id, slot, customerNote });
        await persistReservation(config.dataDir, {
          reservationId,
          createdAt: new Date().toISOString(),
          squareEnvironment: config.squareEnvironment,
          squareBookingId: booking.id,
          squareCustomerId: customer.id,
          bookingStatus: booking.status,
          reservation,
          pricing
        });
        return sendJson(response, 201, {
          reservationId,
          bookingId: booking.id,
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
