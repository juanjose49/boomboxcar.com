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

function checkoutPhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(value || '').trim().slice(0, 17);
}

function appointmentAddress(value) {
  if (value && typeof value === 'object') {
    const address = {
      address_line_1: value.addressLine1,
      locality: value.locality,
      administrative_district_level_1: value.administrativeDistrictLevel1,
      postal_code: value.postalCode
    };
    if (value.addressLine2) address.address_line_2 = value.addressLine2;
    return address;
  }
  const parts = String(value || '').split(',').map(part => part.trim()).filter(Boolean);
  const stateAndZip = parts.at(-1)?.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  const address = {};
  if (parts.length >= 3 && stateAndZip) {
    address.address_line_1 = parts.slice(0, -2).join(', ');
    address.locality = parts.at(-2);
    address.administrative_district_level_1 = stateAndZip[1].toUpperCase();
    address.postal_code = stateAndZip[2];
  } else {
    address.address_line_1 = String(value || '').trim();
  }
  return address;
}

function formattedAppointmentAddress(value) {
  if (!value || typeof value !== 'object') return String(value || '').trim();
  return [value.addressLine1, value.addressLine2, value.locality,
    `${value.administrativeDistrictLevel1} ${value.postalCode}`]
    .filter(Boolean).join(', ');
}

export function createSquareService(config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const catalogCache = new Map();

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

  function locationPrice(data) {
    const override = (data.location_overrides || []).find(entry => entry.location_id === config.squareLocationId);
    return override?.price_money || data.price_money || { amount: 0, currency: 'USD' };
  }

  function catalogModifier(modifier, override = {}) {
    const data = modifier.modifier_data || {};
    const price = locationPrice({ ...data, ...override, location_overrides: data.location_overrides });
    return {
      id: modifier.id,
      name: data.name || 'Modifier',
      price: Number(price.amount || 0) / 100,
      currency: price.currency || 'USD',
      preselected: override.on_by_default ?? data.on_by_default ?? false,
      hiddenOnline: override.hidden_online ?? data.hidden_online ?? false,
      ordinal: data.ordinal || 0
    };
  }

  async function getPackage(durationHours) {
    const hours = Number(durationHours);
    const cached = catalogCache.get(hours);
    if (cached?.expiresAt > Date.now()) return cached.value;
    const pkg = config.packages[hours];
    if (!pkg?.serviceVariationId) throw new AppError(400, 'UNSUPPORTED_DURATION', 'That duration is not configured.');

    const variationResponse = await request(`/v2/catalog/object/${encodeURIComponent(pkg.serviceVariationId)}?include_related_objects=true`);
    const variation = variationResponse.object;
    if (variation?.type !== 'ITEM_VARIATION') {
      throw new AppError(502, 'INVALID_SERVICE_CATALOG', 'The configured Square service variation is invalid.');
    }
    const itemId = variation.item_variation_data?.item_id;
    if (!itemId) throw new AppError(502, 'INVALID_SERVICE_CATALOG', 'The Square service variation has no parent item.');
    const parentItem = (variationResponse.related_objects || []).find(object => object.type === 'ITEM' && object.id === itemId);
    const itemResponse = parentItem
      ? await request(`/v2/catalog/object/${encodeURIComponent(parentItem.id)}?include_related_objects=true`)
      : await request(`/v2/catalog/object/${encodeURIComponent(itemId)}?include_related_objects=true`);
    const item = itemResponse.object;
    if (item?.type !== 'ITEM') throw new AppError(502, 'INVALID_SERVICE_CATALOG', 'The Square service item could not be loaded.');
    const currentVariation = (item?.item_data?.variations || []).find(object => object.id === pkg.serviceVariationId) || variation;
    const listObjects = new Map((itemResponse.related_objects || [])
      .filter(object => object.type === 'MODIFIER_LIST')
      .map(object => [object.id, object]));

    const modifierGroups = (item?.item_data?.modifier_list_info || [])
      .filter(info => info.enabled !== false)
      .map(info => {
        const list = listObjects.get(info.modifier_list_id);
        if (!list) return null;
        const data = list.modifier_list_data || {};
        const overrides = new Map((info.modifier_overrides || []).map(override => [override.modifier_id, override]));
        const listMin = Number(data.min_selected_modifiers || 0);
        const listMax = Number(data.max_selected_modifiers || 0);
        return {
          id: list.id,
          name: data.name || 'Add-ons',
          minSelections: info.min_selected_modifiers >= 0 ? info.min_selected_modifiers : listMin,
          maxSelections: info.max_selected_modifiers >= 0 ? info.max_selected_modifiers : listMax,
          allowQuantities: info.allow_quantities === 'YES' || (info.allow_quantities !== 'NO' && data.allow_quantities === true),
          modifiers: (data.modifiers || [])
            .map(modifier => catalogModifier(modifier, overrides.get(modifier.id)))
            .filter(modifier => !modifier.hiddenOnline)
            .sort((a, b) => a.ordinal - b.ordinal)
        };
      })
      .filter(group => group && group.modifiers.length);
    const baseMoney = locationPrice(currentVariation.item_variation_data || {});
    const value = {
      durationHours: hours,
      serviceVariationId: pkg.serviceVariationId,
      itemId: item.id,
      itemName: item.item_data?.name || `${hours} Hour BoomBoxCar Rental`,
      basePrice: Number(baseMoney.amount || 0) / 100,
      currency: baseMoney.currency || 'USD',
      modifierGroups
    };
    catalogCache.set(hours, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
    return value;
  }

  async function getPackages() {
    return Promise.all(Object.keys(config.packages).map(hours => getPackage(Number(hours))));
  }

  async function findOrCreateCustomer(customer, reservationId) {
    const search = await request('/v2/customers/search', {
      method: 'POST',
      body: {
        limit: 1,
        query: { filter: { email_address: { exact: customer.email } } }
      }
    });
    const existingCustomer = search.customers?.[0];
    if (existingCustomer) {
      const updated = await request(`/v2/customers/${encodeURIComponent(existingCustomer.id)}`, {
        method: 'PUT',
        body: {
          given_name: customer.givenName,
          family_name: customer.familyName,
          email_address: customer.email,
          phone_number: checkoutPhoneNumber(customer.phone),
          version: existingCustomer.version
        }
      });
      return updated.customer;
    }

    const created = await request('/v2/customers', {
      method: 'POST',
      body: {
        idempotency_key: randomUUID(),
        given_name: customer.givenName,
        family_name: customer.familyName,
        email_address: customer.email,
        phone_number: checkoutPhoneNumber(customer.phone),
        reference_id: reservationId,
        note: 'Created by BoomBoxCar.com booking application.'
      }
    });
    return created.customer;
  }

  async function createBooking({ customerId, slot, customerNote, eventAddress }) {
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
          location_type: 'CUSTOMER_LOCATION',
          address: appointmentAddress(eventAddress),
          customer_note: customerNote.slice(0, 4096),
          appointment_segments: appointmentSegments
        }
      }
    });
    return payload.booking;
  }

  async function createPaymentLink({ customer, customerId, bookingId, reservationId, confirmationToken, eventAddress, packageDetails, modifiers }) {
    const contactName = `${customer.givenName} ${customer.familyName}`.trim();
    const eventAddressLabel = formattedAppointmentAddress(eventAddress);
    const lineItem = {
      catalog_object_id: packageDetails.serviceVariationId,
      quantity: '1',
      note: [
        `Event contact: ${contactName}`,
        `Phone: ${customer.phone}`,
        `Event address: ${eventAddressLabel}`,
        `Square booking: ${bookingId}`
      ].join('\n').slice(0, 2000)
    };
    if (modifiers.length) {
      lineItem.modifiers = modifiers.map(modifier => ({
        catalog_object_id: modifier.id,
        quantity: String(modifier.quantity)
      }));
    }
    const confirmationUrl = new URL('/confirmation/', config.appBaseUrl);
    confirmationUrl.searchParams.set('reservation', reservationId);
    confirmationUrl.searchParams.set('token', confirmationToken);
    const payload = await request('/v2/online-checkout/payment-links', {
      method: 'POST',
      body: {
        idempotency_key: randomUUID(),
        description: `BoomBoxCar reservation ${reservationId}`,
        order: {
          location_id: config.squareLocationId,
          reference_id: reservationId,
          customer_id: customerId,
          line_items: [lineItem]
        },
        checkout_options: {
          allow_tipping: false,
          ask_for_shipping_address: false,
          redirect_url: confirmationUrl.toString(),
          merchant_support_email: 'booking@boomboxcar.com',
          accepted_payment_methods: {
            apple_pay: true,
            google_pay: true,
            cash_app_pay: true,
            afterpay_clearpay: false
          }
        },
        pre_populated_data: {
          buyer_email: customer.email,
          buyer_phone_number: checkoutPhoneNumber(customer.phone),
          buyer_address: {
            first_name: customer.givenName,
            last_name: customer.familyName
          }
        },
        payment_note: `BoomBoxCar ${reservationId}; Square booking ${bookingId}`
      }
    });
    const paymentLink = payload.payment_link;
    let checkoutUrl;
    try { checkoutUrl = new URL(paymentLink?.url); } catch (_) {}
    const expectedCheckoutHost = config.squareEnvironment === 'production' ? 'square.link' : 'sandbox.square.link';
    if (!paymentLink?.id || !paymentLink?.order_id || checkoutUrl?.protocol !== 'https:' || checkoutUrl.hostname !== expectedCheckoutHost) {
      throw new AppError(502, 'INVALID_PAYMENT_LINK_RESPONSE', 'Square did not return a usable checkout link.');
    }
    return paymentLink;
  }

  async function cancelBooking(booking) {
    const payload = await request(`/v2/bookings/${encodeURIComponent(booking.id)}/cancel`, {
      method: 'POST',
      body: {
        idempotency_key: randomUUID(),
        booking_version: booking.version
      }
    });
    return payload.booking;
  }

  async function retrieveOrder(orderId) {
    const payload = await request(`/v2/orders/${encodeURIComponent(orderId)}`);
    return payload.order;
  }

  async function deletePaymentLink(paymentLinkId) {
    return request(`/v2/online-checkout/payment-links/${encodeURIComponent(paymentLinkId)}`, {
      method: 'DELETE'
    });
  }

  return {
    searchAvailability, getPackage, getPackages, findOrCreateCustomer, createBooking,
    createPaymentLink, cancelBooking, retrieveOrder, deletePaymentLink
  };
}
