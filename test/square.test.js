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

test('coupon environment entries are parsed privately into fixed and percentage rules', () => {
  const config = loadConfig({
    ...env,
    BOOMBOXCAR_COUPONS: 'welcome10:percent:10,BOOM50:FIXED:50,broken entry'
  });
  assert.deepEqual(config.coupons.get('WELCOME10'), { code: 'WELCOME10', type: 'PERCENT', value: 10 });
  assert.deepEqual(config.coupons.get('BOOM50'), { code: 'BOOM50', type: 'FIXED', value: 50 });
  assert.equal(config.coupons.size, 2);
});

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
    customerNote: 'Add-ons:\n- Night package: +$125\n- Karaoke: +$100',
    eventAddress: {
      addressLine1: '123 Test Street', addressLine2: 'Suite 2', locality: 'Silver Spring',
      administrativeDistrictLevel1: 'MD', postalCode: '20910'
    }
  });

  assert.match(bookingBody.booking.customer_note, /Night package: \+\$125/);
  assert.match(bookingBody.booking.customer_note, /Karaoke: \+\$100/);
  assert.equal(bookingBody.booking.appointment_segments[0].service_variation_id, 'SERVICE-4H');
  assert.equal(bookingBody.booking.location_type, 'CUSTOMER_LOCATION');
  assert.deepEqual(bookingBody.booking.address, {
    address_line_1: '123 Test Street', address_line_2: 'Suite 2', locality: 'Silver Spring',
    administrative_district_level_1: 'MD', postal_code: '20910'
  });
});

test('Square existing customer is updated with the normalized first and last name', async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, method: options.method, body });
    if (url.endsWith('/v2/customers/search')) {
      return new Response(JSON.stringify({
        customers: [{ id: 'CUSTOMER-1', given_name: 'Juan San', family_name: 'Emeterio', version: 7 }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      customer: { id: 'CUSTOMER-1', given_name: body.given_name, family_name: body.family_name, version: 8 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const service = createSquareService(loadConfig(env), fakeFetch);
  const customer = await service.findOrCreateCustomer({
    givenName: 'Juan', familyName: 'San Emeterio', email: 'juan@example.com', phone: '240-381-7140'
  }, 'BBC-2099-ABC123');

  assert.equal(requests[1].url, 'https://connect.squareupsandbox.com/v2/customers/CUSTOMER-1');
  assert.equal(requests[1].method, 'PUT');
  assert.deepEqual(requests[1].body, {
    given_name: 'Juan', family_name: 'San Emeterio', email_address: 'juan@example.com',
    phone_number: '+12403817140', version: 7
  });
  assert.equal(customer.given_name, 'Juan');
  assert.equal(customer.family_name, 'San Emeterio');
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

test('Square Catalog supplies live prices for every booking duration', async () => {
  const requests = [];
  const prices = { 1: 25100, 2: 40200, 3: 55300, 4: 70400, 8: 130800 };
  const fakeFetch = async url => {
    requests.push(url);
    const id = decodeURIComponent(url.match(/\/v2\/catalog\/object\/([^?]+)/)[1]);
    const hours = Number(id.match(/(\d+)H$/)?.[1]);
    const variation = {
      type: 'ITEM_VARIATION', id: `SERVICE-${hours}H`,
      item_variation_data: {
        item_id: `ITEM-${hours}H`, name: `${hours} hours`,
        price_money: { amount: prices[hours], currency: 'USD' }
      }
    };
    const item = {
      type: 'ITEM', id: `ITEM-${hours}H`,
      item_data: { name: `${hours} Hour Rental`, variations: [variation], modifier_list_info: [] }
    };
    const payload = id.startsWith('SERVICE-')
      ? { object: variation, related_objects: [item] }
      : { object: item, related_objects: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const service = createSquareService(loadConfig(env), fakeFetch);
  const packages = await service.getPackages();
  const cachedPackages = await service.getPackages();

  assert.equal(requests.length, 10);
  assert.deepEqual(packages.map(pkg => [pkg.durationHours, pkg.basePrice]), [
    [1, 251], [2, 402], [3, 553], [4, 704], [8, 1308]
  ]);
  assert.deepEqual(cachedPackages, packages);
});

test('Square checkout references the booking package and selected Catalog modifiers', async () => {
  let checkoutRequest;
  const fakeFetch = async (url, options) => {
    checkoutRequest = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      payment_link: { id: 'LINK-1', order_id: 'ORDER-1', url: 'https://sandbox.square.link/u/TEST' }
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);
  const paymentLink = await service.createPaymentLink({
    customer: {
      givenName: 'Test', familyName: 'Customer', email: 'buyer@example.com', phone: '(301) 555-0199'
    },
    customerId: 'CUSTOMER-1', reservationId: 'BBC-2099-ABC123',
    bookingId: 'BOOKING-1',
    confirmationToken: 'abcdefghijklmnopqrstuvwxyzABCDEF',
    eventAddress: {
      addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
      administrativeDistrictLevel1: 'MD', postalCode: '20910'
    },
    packageDetails: { serviceVariationId: 'SERVICE-1H', currency: 'USD' },
    modifiers: [{ id: 'BUBBLE', quantity: 1 }, { id: 'LASER', quantity: 2 }],
    discount: { code: 'SAVE10', name: 'Coupon SAVE10', type: 'PERCENT', value: 10, amount: 39.9 }
  });

  assert.equal(paymentLink.order_id, 'ORDER-1');
  assert.equal(checkoutRequest.url, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
  assert.equal(checkoutRequest.body.order.reference_id, 'BBC-2099-ABC123');
  assert.equal(checkoutRequest.body.order.customer_id, 'CUSTOMER-1');
  assert.equal(checkoutRequest.body.order.line_items[0].catalog_object_id, 'SERVICE-1H');
  assert.deepEqual(checkoutRequest.body.order.line_items[0].modifiers, [
    { catalog_object_id: 'BUBBLE', quantity: '1' },
    { catalog_object_id: 'LASER', quantity: '2' }
  ]);
  assert.equal(checkoutRequest.body.checkout_options.redirect_url, 'http://localhost:3100/confirmation/?reservation=BBC-2099-ABC123&token=abcdefghijklmnopqrstuvwxyzABCDEF');
  assert.equal(checkoutRequest.body.checkout_options.accepted_payment_methods.apple_pay, true);
  assert.equal(checkoutRequest.body.checkout_options.allow_tipping, false);
  assert.equal(checkoutRequest.body.checkout_options.ask_for_shipping_address, false);
  assert.equal(checkoutRequest.body.checkout_options.enable_coupon, false);
  assert.deepEqual(checkoutRequest.body.order.discounts, [{
    uid: 'boomboxcar-coupon', name: 'Coupon SAVE10', scope: 'ORDER',
    type: 'FIXED_PERCENTAGE', percentage: '10'
  }]);
  assert.equal(checkoutRequest.body.pre_populated_data.buyer_email, 'buyer@example.com');
  assert.equal(checkoutRequest.body.pre_populated_data.buyer_phone_number, '+13015550199');
  assert.deepEqual(checkoutRequest.body.pre_populated_data.buyer_address, {
    first_name: 'Test', last_name: 'Customer'
  });
  assert.equal(checkoutRequest.body.pre_populated_data.buyer_address.address_line_1, undefined);
  assert.match(checkoutRequest.body.order.line_items[0].note, /Event contact: Test Customer/);
  assert.match(checkoutRequest.body.order.line_items[0].note, /Phone: \(301\) 555-0199/);
  assert.match(checkoutRequest.body.order.line_items[0].note, /Event address: 123 Test Street/);
  assert.match(checkoutRequest.body.payment_note, /BOOKING-1/);
});

test('Square direct order preserves the booking item, modifiers, and event details', async () => {
  let orderRequest;
  const fakeFetch = async (url, options) => {
    orderRequest = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ order: { id: 'ORDER-APPLE-1', state: 'OPEN', version: 1 } }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);
  const order = await service.createOrder({
    customer: { givenName: 'Juan', familyName: 'San Emeterio', phone: '240-381-7140' },
    customerId: 'CUSTOMER-1', bookingId: 'BOOKING-1', reservationId: 'BBC-2099-ABC123',
    eventAddress: {
      addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
      administrativeDistrictLevel1: 'MD', postalCode: '20910'
    },
    packageDetails: { serviceVariationId: 'SERVICE-3H', currency: 'USD' },
    modifiers: [{ id: 'BUBBLE', quantity: 1 }, { id: 'LASER', quantity: 2 }],
    discount: { code: 'BOOM50', name: 'Coupon BOOM50', type: 'FIXED', value: 50, amount: 50 }
  });

  assert.equal(order.id, 'ORDER-APPLE-1');
  assert.equal(orderRequest.url, 'https://connect.squareupsandbox.com/v2/orders');
  assert.equal(orderRequest.body.order.location_id, 'LOCATION-1');
  assert.equal(orderRequest.body.order.reference_id, 'BBC-2099-ABC123');
  assert.equal(orderRequest.body.order.customer_id, 'CUSTOMER-1');
  assert.equal(orderRequest.body.order.line_items[0].catalog_object_id, 'SERVICE-3H');
  assert.deepEqual(orderRequest.body.order.line_items[0].modifiers, [
    { catalog_object_id: 'BUBBLE', quantity: '1' },
    { catalog_object_id: 'LASER', quantity: '2' }
  ]);
  assert.deepEqual(orderRequest.body.order.discounts, [{
    uid: 'boomboxcar-coupon', name: 'Coupon BOOM50', scope: 'ORDER', type: 'FIXED_AMOUNT',
    amount_money: { amount: 5000, currency: 'USD' }
  }]);
  assert.match(orderRequest.body.order.line_items[0].note, /Event contact: Juan San Emeterio/);
  assert.match(orderRequest.body.order.line_items[0].note, /Event address: 123 Test Street/);
  assert.match(orderRequest.body.order.line_items[0].note, /Square booking: BOOKING-1/);
});

test('Square direct payment charges the server total against the created order', async () => {
  let paymentRequest;
  const fakeFetch = async (url, options) => {
    paymentRequest = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      payment: {
        id: 'PAYMENT-1', status: 'COMPLETED', order_id: 'ORDER-1',
        receipt_url: 'https://squareup.com/receipt/preview/PAYMENT-1'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);
  const payment = await service.createPayment({
    sourceId: 'cnon:apple-pay-token', orderId: 'ORDER-1', customerId: 'CUSTOMER-1',
    reservationId: 'BBC-2099-ABC123',
    customer: {
      givenName: 'Test', familyName: 'Customer', email: 'buyer@example.com', phone: '(301) 555-0199'
    },
    pricing: { total: 674, currency: 'USD' }
  });

  assert.equal(payment.status, 'COMPLETED');
  assert.equal(paymentRequest.url, 'https://connect.squareupsandbox.com/v2/payments');
  assert.equal(paymentRequest.body.source_id, 'cnon:apple-pay-token');
  assert.deepEqual(paymentRequest.body.amount_money, { amount: 67400, currency: 'USD' });
  assert.equal(paymentRequest.body.order_id, 'ORDER-1');
  assert.equal(paymentRequest.body.customer_id, 'CUSTOMER-1');
  assert.equal(paymentRequest.body.location_id, 'LOCATION-1');
  assert.equal(paymentRequest.body.reference_id, 'BBC-2099-ABC123');
  assert.equal(paymentRequest.body.buyer_email_address, 'buyer@example.com');
  assert.equal(paymentRequest.body.buyer_phone_number, '+13015550199');
  assert.equal(paymentRequest.body.autocomplete, true);
});

test('Square booking cancellation rolls back a reservation when checkout fails', async () => {
  let cancellationRequest;
  const fakeFetch = async (url, options) => {
    cancellationRequest = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ booking: { id: 'BOOKING-1', status: 'CANCELLED_BY_SELLER' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);
  const booking = await service.cancelBooking({ id: 'BOOKING-1', version: 3 });

  assert.equal(booking.status, 'CANCELLED_BY_SELLER');
  assert.equal(cancellationRequest.url, 'https://connect.squareupsandbox.com/v2/bookings/BOOKING-1/cancel');
  assert.equal(cancellationRequest.body.booking_version, 3);
});

test('Square expiration helpers inspect the order before deleting checkout', async () => {
  const requests = [];
  const fakeFetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    const payload = options.method === 'DELETE'
      ? { id: 'LINK-1', cancelled_order_id: 'ORDER-1' }
      : { order: { id: 'ORDER-1', state: 'OPEN' } };
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const service = createSquareService(loadConfig(env), fakeFetch);

  assert.equal((await service.retrieveOrder('ORDER-1')).state, 'OPEN');
  assert.equal((await service.deletePaymentLink('LINK-1')).cancelled_order_id, 'ORDER-1');
  assert.deepEqual(requests, [
    { url: 'https://connect.squareupsandbox.com/v2/orders/ORDER-1', method: 'GET' },
    { url: 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links/LINK-1', method: 'DELETE' }
  ]);
});
