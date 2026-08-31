import { AppError } from './errors.js';

const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

function clean(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function createCouponEntry(input) {
  const code = clean(input?.code, 40).toUpperCase();
  const type = clean(input?.type, 20).toUpperCase();
  const value = Number(input?.value);
  if (!CODE_PATTERN.test(code)) throw new AppError(400, 'INVALID_COUPON_CODE', 'Coupon code must be 3 to 40 letters, numbers, underscores, or hyphens.');
  if (!['PERCENT', 'FIXED'].includes(type)) throw new AppError(400, 'INVALID_COUPON_TYPE', 'Coupon type must be percentage or fixed amount.');
  if (!Number.isFinite(value) || value <= 0 || (type === 'PERCENT' && value > 100) || (type === 'FIXED' && value > 10000)) {
    throw new AppError(400, 'INVALID_COUPON_VALUE', type === 'PERCENT'
      ? 'Percentage coupons must be greater than 0 and no more than 100 percent.'
      : 'Fixed coupons must be greater than $0 and no more than $10,000.');
  }
  return Object.freeze({ code, type, value: Math.round(value * 100) / 100, active: input.active !== false });
}

export function couponConfigEntry(coupon) {
  return { code: coupon.code, type: coupon.type, value: coupon.value, active: coupon.active };
}

export function parseCouponEntries(value) {
  const entries = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(entries)) throw new Error('Coupon data must be a JSON array.');
  const coupons = new Map();
  for (const entry of entries) {
    const coupon = createCouponEntry(entry);
    if (coupons.has(coupon.code)) throw new Error('Coupon data contains a duplicate code.');
    coupons.set(coupon.code, coupon);
  }
  return coupons;
}

export function resolveCoupon(coupons, code) {
  if (!code) return null;
  const coupon = coupons.get(String(code).trim().toUpperCase());
  if (!coupon || !coupon.active) throw new AppError(400, 'COUPON_NOT_RECOGNIZED', 'That coupon code is not recognized.');
  return coupon;
}
