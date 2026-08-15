import { randomUUID } from 'node:crypto';
import { EVENT_TIME_ZONE, MINIMUM_NOTICE_HOURS } from './config.js';
import { AppError, SquareError } from './errors.js';

function isoDateInTimeZone(isoTimestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(isoTimestamp));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function slotLabel(isoTimestamp, locale) {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric', minute: '2-digit'
  }).format(new Date(isoTimestamp));
}

export function createSquareService(config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  async function request(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${config.squareBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.squareAccessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': config.squareApiVersion
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.errors?.length) {
      throw new SquareError(response.status, payload.errors || []);
    }
    return payload;
  }

  async function searchAvailability({ date, durationHours, locale = 'en' }) {
    const pkg = config.packages[durationHours];
    if (!pkg?.serviceVariationId) {
      throw new AppError(400, 'UNSUPPORTED_DURATION', 'That duration is not configured.');
    }
    const center = Date.parse(`${date}T12:00:00Z`);
    const startAt = new Date(center - 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(center + 24 * 60 * 60 * 1000).toISOString();
    const payload = await request('/v2/bookings/availability/search', {
      method: 'POST',
      body: {
        query: {
          filter: {
            start_at_range: { start_at: startAt, end_at: endAt },
            location_id: config.squareLocationId,
            segment_filters: [{
              service_variation_id: pkg.serviceVariationId,
              team_member_id_filter: { any: config.teamMemberIds }
            }]
          }
        }
      }
    });
    const earliest = Date.now() + MINIMUM_NOTICE_HOURS * 60 * 60 * 1000;
    return (payload.availabilities || [])
      .filter(slot => isoDateInTimeZone(slot.start_at) === date && Date.parse(slot.start_at) >= earliest)
      .map(slot => ({
        startAt: slot.start_at,
        label: slotLabel(slot.start_at, locale),
        locationId: slot.location_id,
        appointmentSegments: slot.appointment_segments
      }));
  }

  async function findOrCreateCustomer(customer, reservationId) {
    const search = await request('/v2/customers/search', {
      method: 'POST',
      body: {
        limit: 1,
        query: { filter: { email_address: { exact: customer.email } } }
      }
    });
    if (search.customers?.[0]) return search.customers[0];

    const created = await request('/v2/customers', {
      method: 'POST',
      body: {
        idempotency_key: randomUUID(),
        given_name: customer.givenName,
        family_name: customer.familyName,
        email_address: customer.email,
        phone_number: customer.phone,
        reference_id: reservationId,
        note: 'Created by BoomBoxCar.com booking application.'
      }
    });
    return created.customer;
  }

  async function createBooking({ customerId, slot, customerNote }) {
    const appointmentSegments = (slot.appointmentSegments || []).map(segment => ({
      duration_minutes: segment.duration_minutes,
      service_variation_id: segment.service_variation_id,
      service_variation_version: segment.service_variation_version,
      team_member_id: segment.team_member_id
    }));
    const payload = await request('/v2/bookings', {
      method: 'POST',
      body: {
        idempotency_key: randomUUID(),
        booking: {
          customer_id: customerId,
          start_at: slot.startAt,
          location_id: slot.locationId,
          customer_note: customerNote.slice(0, 4096),
          appointment_segments: appointmentSegments
        }
      }
    });
    return payload.booking;
  }

  return { searchAvailability, findOrCreateCustomer, createBooking };
}
