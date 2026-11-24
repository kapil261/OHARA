import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** 6-digit numeric OTP. */
export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

// No 0/O/1/I so the code is easy to read aloud on the patient screen.
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const pairingCode = (len = 5) =>
  Array.from({ length: len }, () => PAIR_ALPHABET[randomInt(0, PAIR_ALPHABET.length)]).join('');

export const safeEqualHex = (a: string, b: string) => {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};
