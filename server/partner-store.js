import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';
import { createPartnerEntry, parsePartners, partnerConfigEntry } from './partners.js';

const FILE_NAME = 'partners.json';

export function createPartnerStore(dataDir, seedPartners = new Map()) {
  const filePath = path.join(dataDir, FILE_NAME);
  let partners = new Map(seedPartners);
  let loaded = false;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (loaded) return partners;
    try {
      const contents = await readFile(filePath, 'utf8');
      const entries = JSON.parse(contents);
      if (!Array.isArray(entries)) throw new Error('Partner data must be a JSON array.');
      const parsed = parsePartners(contents);
      if (parsed.size !== entries.length) throw new Error('Partner data contains an invalid or duplicate entry.');
      partners = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    loaded = true;
    return partners;
  }

  async function persist(nextPartners) {
    const entries = [...nextPartners.values()].map(partnerConfigEntry).sort((left, right) => left.code.localeCompare(right.code));
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
    partners = nextPartners;
    return partners;
  }

  function mutate(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function list() {
    return [...(await load()).values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async function create(input) {
    return mutate(async () => {
      const current = await load();
      const partner = createPartnerEntry(input);
      if ([...current.values()].some(existing => existing.code === partner.code)) {
        throw new AppError(409, 'PARTNER_CODE_EXISTS', 'A partner already uses that code.');
      }
      if ([...current.values()].some(existing => existing.qrCampaignId === partner.qrCampaignId)) {
        throw new AppError(409, 'PARTNER_CAMPAIGN_EXISTS', 'A partner already uses that QR campaign identifier.');
      }
      await persist(new Map([...current, [partner.token, partner]]));
      return partner;
    });
  }

  async function update(code, input) {
    return mutate(async () => {
      const current = await load();
      const normalizedCode = String(code || '').trim().toUpperCase();
      const existing = [...current.values()].find(partner => partner.code === normalizedCode);
      if (!existing) throw new AppError(404, 'PARTNER_NOT_FOUND', 'Partner not found.');
      const partner = createPartnerEntry({ ...input, code: existing.code }, existing.token);
      if ([...current.values()].some(candidate => candidate.token !== existing.token && candidate.qrCampaignId === partner.qrCampaignId)) {
        throw new AppError(409, 'PARTNER_CAMPAIGN_EXISTS', 'A partner already uses that QR campaign identifier.');
      }
      const next = new Map(current);
      next.set(existing.token, partner);
      await persist(next);
      return partner;
    });
  }

  return { all: load, list, create, update, filePath };
}
