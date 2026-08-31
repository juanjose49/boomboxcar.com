import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';
import { couponConfigEntry, createCouponEntry, parseCouponEntries } from './coupons.js';

export function createCouponStore(dataDir) {
  const filePath = path.join(dataDir, 'coupons.json');
  let coupons = new Map();
  let loaded = false;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (loaded) return coupons;
    try { coupons = parseCouponEntries(await readFile(filePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    loaded = true;
    return coupons;
  }

  async function persist(nextCoupons) {
    const entries = [...nextCoupons.values()].map(couponConfigEntry).sort((left, right) => left.code.localeCompare(right.code));
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
    coupons = nextCoupons;
  }

  function mutate(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function list() {
    return [...(await load()).values()].sort((left, right) => left.code.localeCompare(right.code));
  }

  async function create(input) {
    return mutate(async () => {
      const current = await load();
      const coupon = createCouponEntry(input);
      if (current.has(coupon.code)) throw new AppError(409, 'COUPON_CODE_EXISTS', 'A coupon already uses that code.');
      await persist(new Map([...current, [coupon.code, coupon]]));
      return coupon;
    });
  }

  async function update(code, input) {
    return mutate(async () => {
      const current = await load();
      const normalizedCode = String(code || '').trim().toUpperCase();
      if (!current.has(normalizedCode)) throw new AppError(404, 'COUPON_NOT_FOUND', 'Coupon not found.');
      const coupon = createCouponEntry({ ...input, code: normalizedCode });
      const next = new Map(current);
      next.set(coupon.code, coupon);
      await persist(next);
      return coupon;
    });
  }

  return { all: load, list, create, update, filePath };
}
