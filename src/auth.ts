import crypto from 'node:crypto';
import { db, getOrCreateBalance, nowIso } from './db.js';
import { v4 as uuidv4 } from 'uuid';

export function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function createCustomer() {
  const id = uuidv4();
  db.prepare('INSERT INTO customers (id, created_at) VALUES (?, ?)').run(id, nowIso());
  getOrCreateBalance(id);
  return id;
}

export function createApiKey(customerId: string) {
  const id = uuidv4();
  const raw = `vera_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = sha256Hex(raw);

  db.prepare('INSERT INTO api_keys (id, customer_id, key_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    customerId,
    keyHash,
    nowIso()
  );

  return { apiKey: raw, apiKeyId: id };
}

export function authenticateApiKey(rawKey: string) {
  const keyHash = sha256Hex(rawKey);
  const row = db
    .prepare(
      'SELECT ak.id as api_key_id, ak.customer_id as customer_id, ak.revoked_at as revoked_at FROM api_keys ak WHERE ak.key_hash = ?'
    )
    .get(keyHash) as { api_key_id: string; customer_id: string; revoked_at: string | null } | undefined;

  if (!row || row.revoked_at) return null;
  return { apiKeyId: row.api_key_id, customerId: row.customer_id };
}
