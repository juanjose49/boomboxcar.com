import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';
import { createSquareService } from '../server/square.js';

const env = {
  NODE_ENV: 'test',
  SQUARE_ENVIRONMENT: 'sandbox',
  SQUARE_ACCESS_TOKEN: 'sandbox-token',
  SQUARE_LOCATION_ID: 'LOCATION-1',
  SQUARE_TEAM_MEMBER_IDS: 'TEAM-1,TEAM-2',
  SQUARE_SERVICE_VARIATION_1H: 'SERVICE-1H',
  SQUARE_SERVICE_VARIATION_2H: 'SERVICE-2H',
  SQUARE_SERVICE_VARIATION_3H: 'SERVICE-3H',
  SQUARE_SERVICE_VARIATION_4H: 'SERVICE-4H',
  SQUARE_SERVICE_VARIATION_8H: 'SERVICE-8H'
};

test('Square availability uses configured location, service, and team member IDs', async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      availabilities: [{
        start_at: '2099-08-20T23:00:00Z',
        location_id: 'LOCATION-1',
        appointment_segments: [{
          duration_minutes: 240,
          service_variation_id: 'SERVICE-4H',
          service_variation_version: 123,
          team_member_id: 'TEAM-1'
        }]
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const service = createSquareService(loadConfig(env), fakeFetch);
  const slots = await service.searchAvailability({ date: '2099-08-20', durationHours: 4 });

  assert.equal(slots.length, 1);
  assert.equal(requests[0].url, 'https://connect.squareupsandbox.com/v2/bookings/availability/search');
  const filter = requests[0].body.query.filter;
  assert.equal(filter.location_id, 'LOCATION-1');
  assert.equal(filter.segment_filters[0].service_variation_id, 'SERVICE-4H');
  assert.deepEqual(filter.segment_filters[0].team_member_id_filter.any, ['TEAM-1', 'TEAM-2']);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sandbox-token');
});

test('Square booking keeps modifiers in the customer note', async () => {
  let bookingBody;
  const fakeFetch = async (url, options) => {
    bookingBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ booking: { id: 'BOOKING-1', status: 'ACCEPTED' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);
  await service.createBooking({
    customerId: 'CUSTOMER-1',
    slot: {
      startAt: '2099-08-20T23:00:00Z',
      locationId: 'LOCATION-1',
      appointmentSegments: [{
        duration_minutes: 240,
        service_variation_id: 'SERVICE-4H',
        service_variation_version: 123,
        team_member_id: 'TEAM-1'
      }]
    },
    customerNote: 'Add-ons:\n- Night package: +$125\n- Karaoke: +$100'
  });

  assert.match(bookingBody.booking.customer_note, /Night package: \+\$125/);
  assert.match(bookingBody.booking.customer_note, /Karaoke: \+\$100/);
  assert.equal(bookingBody.booking.appointment_segments[0].service_variation_id, 'SERVICE-4H');
});
