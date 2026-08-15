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

test('Square Catalog resolves package-specific modifier names, prices, and rules', async () => {
  const requests = [];
  const variation = {
    type: 'ITEM_VARIATION', id: 'SERVICE-1H', version: 123,
    item_variation_data: { item_id: 'ITEM-1H', name: 'Regular', price_money: { amount: 24900, currency: 'USD' } }
  };
  const item = {
    type: 'ITEM', id: 'ITEM-1H', item_data: {
      name: '1 Hour Rental',
      variations: [variation],
      modifier_list_info: [{
        modifier_list_id: 'LIST-1H', min_selected_modifiers: -1, max_selected_modifiers: -1,
        allow_quantities: 'NOT_SET', enabled: true
      }]
    }
  };
  const modifierList = {
    type: 'MODIFIER_LIST', id: 'LIST-1H', modifier_list_data: {
      name: 'BoomBoxCar 1 Hour Add-Ons', min_selected_modifiers: 0, max_selected_modifiers: 0,
      allow_quantities: false,
      modifiers: [
        { type: 'MODIFIER', id: 'BUBBLE', modifier_data: { name: 'Bubble Machine', price_money: { amount: 2500, currency: 'USD' }, ordinal: 1 } },
        { type: 'MODIFIER', id: 'LASER', modifier_data: { name: 'Laser & Haze Effects', price_money: { amount: 5000, currency: 'USD' }, ordinal: 2 } }
      ]
    }
  };
  const fakeFetch = async url => {
    requests.push(url);
    const payload = url.includes('SERVICE-1H')
      ? { object: variation, related_objects: [item] }
      : { object: item, related_objects: [modifierList] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const service = createSquareService(loadConfig(env), fakeFetch);
  const pkg = await service.getPackage(1);
  const cached = await service.getPackage(1);

  assert.equal(requests.length, 2);
  assert.equal(cached, pkg);
  assert.equal(pkg.basePrice, 249);
  assert.equal(pkg.modifierGroups[0].name, 'BoomBoxCar 1 Hour Add-Ons');
  assert.deepEqual(pkg.modifierGroups[0].modifiers.map(modifier => [modifier.id, modifier.price]), [
    ['BUBBLE', 25], ['LASER', 50]
  ]);
});

test('Square order references the booking package and selected Catalog modifiers', async () => {
  let orderBody;
  const fakeFetch = async (url, options) => {
    orderBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ order: { id: 'ORDER-1', state: 'OPEN' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);
  const order = await service.createOrder({
    customerId: 'CUSTOMER-1', reservationId: 'BBC-2099-ABC123',
    packageDetails: { serviceVariationId: 'SERVICE-1H' },
    modifiers: [{ id: 'BUBBLE', quantity: 1 }, { id: 'LASER', quantity: 2 }]
  });

  assert.equal(order.id, 'ORDER-1');
  assert.equal(orderBody.order.reference_id, 'BBC-2099-ABC123');
  assert.equal(orderBody.order.customer_id, 'CUSTOMER-1');
  assert.equal(orderBody.order.line_items[0].catalog_object_id, 'SERVICE-1H');
  assert.deepEqual(orderBody.order.line_items[0].modifiers, [
    { catalog_object_id: 'BUBBLE', quantity: '1' },
    { catalog_object_id: 'LASER', quantity: '2' }
  ]);
});
