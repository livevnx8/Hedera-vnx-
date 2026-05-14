import crypto from 'node:crypto';
import * as nacl from 'tweetnacl';

export function sha256Base64(data: Uint8Array | string) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  return crypto.createHash('sha256').update(buf).digest('base64');
}

export function canonicalJson(obj: unknown) {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

export function signDetachedBase64(payloadUtf8: string, secretKeyBase64: string) {
  const secretKey = Buffer.from(secretKeyBase64, 'base64');
  if (secretKey.length !== 64) throw new Error('RECEIPT_SIGNING_SECRET_KEY_BASE64 must be 64 bytes base64 (ed25519 secret key).');
  const sig = nacl.sign.detached(Buffer.from(payloadUtf8, 'utf8'), secretKey);
  return Buffer.from(sig).toString('base64');
}
