import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.mjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30000;
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0, value = 0;
  const out = [];
  for (const char of String(text).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | ALPHABET.indexOf(char); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));
export const currentStep = (now = Date.now()) => Math.floor(now / STEP_MS);

export function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

// 일치한 시간 단계를 돌려준다. 이미 쓴 단계(lastStep 이하)는 다시 받지 않는다.
export function matchStep(secret, code, lastStep = 0, now = Date.now()) {
  const input = Buffer.from(String(code).replace(/\D/g, '').padStart(6, '0').slice(0, 6));
  const step = currentStep(now);
  let matched = 0;
  for (const candidate of [step - 1, step, step + 1]) {
    if (timingSafeEqual(Buffer.from(codeAt(secret, candidate)), input) && candidate > lastStep && !matched) matched = candidate;
  }
  return matched;
}

export const otpauthUri = (secret, email) => `otpauth://totp/${encodeURIComponent(`Folio:${email}`)}?secret=${secret}&issuer=Folio&algorithm=SHA1&digits=6&period=30`;

const key = () => Buffer.from(hkdfSync('sha256', config.sessionSecret, 'folio', 'otp-secret', 32));

export function sealSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function openSecret(sealed) {
  const data = Buffer.from(sealed);
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

export function newRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const text = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${text.slice(0, 5)}-${text.slice(5)}`;
  });
}

export const recoveryHash = code => sha256(String(code).toLowerCase().replace(/[^a-z2-7]/g, ''));
