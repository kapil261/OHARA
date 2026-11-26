import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../src/utils/crypto.js';

const db = vi.hoisted(() => ({
  otpCode: { count: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  user: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));
const mail = vi.hoisted(() => ({ sendMail: vi.fn(), simpleHtml: vi.fn(() => '<p></p>') }));
vi.mock('../src/integrations/mailer.js', () => mail);
const sms = vi.hoisted(() => ({ sendOtpSms: vi.fn() }));
vi.mock('../src/integrations/sms.js', () => sms);

const { requestOtp, verifyOtp } = await import('../src/modules/auth/service.js');

const EMAIL = 'rina@example.com';
const liveOtp = (code: string, extra: Record<string, unknown> = {}) => ({
  id: 'otp-1',
  identifier: EMAIL,
  codeHash: sha256(`${EMAIL}:${code}`),
  expiresAt: new Date(Date.now() + 60_000),
  attempts: 0,
  consumed: false,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.user.upsert.mockResolvedValue({ id: 'u1', email: EMAIL });
});

describe('requestOtp', () => {
  it('normalises the email, stores only a hash, and mails the code', async () => {
    db.otpCode.count.mockResolvedValue(0);
    const res = await requestOtp('  Rina@Example.COM ');
    expect(res).toMatchObject({ sent: true });
    const stored = db.otpCode.create.mock.calls[0][0].data;
    expect(stored.identifier).toBe(EMAIL);
    const code = mail.sendMail.mock.calls[0][0].text.match(/\b(\d{6})\b/)[1];
    expect(stored.codeHash).toBe(sha256(`${EMAIL}:${code}`));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('invalidates older live codes so only one works at a time', async () => {
    db.otpCode.count.mockResolvedValue(1);
    await requestOtp(EMAIL);
    expect(db.otpCode.updateMany).toHaveBeenCalledWith({ where: { identifier: EMAIL, consumed: false }, data: { consumed: true } });
  });

  it('429 after 5 codes in an hour, without creating or mailing a new one', async () => {
    db.otpCode.count.mockResolvedValue(5);
    await expect(requestOtp(EMAIL)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(db.otpCode.create).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe('verifyOtp', () => {
  it('signs in with the right code and consumes it', async () => {
    db.otpCode.findFirst.mockResolvedValue(liveOtp('123456'));
    db.otpCode.updateMany.mockResolvedValue({ count: 1 });
    const user = await verifyOtp(EMAIL, '123456');
    expect(user.id).toBe('u1');
    expect(db.otpCode.updateMany).toHaveBeenLastCalledWith({ where: { id: 'otp-1', consumed: false }, data: { consumed: true } });
  });

  it('400 INVALID_OTP for a wrong code, and the attempt is counted first', async () => {
    db.otpCode.findFirst.mockResolvedValue(liveOtp('123456'));
    db.otpCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(verifyOtp(EMAIL, '000000')).rejects.toMatchObject({ status: 400, code: 'INVALID_OTP' });
    expect(db.otpCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'otp-1', consumed: false, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    expect(db.user.upsert).not.toHaveBeenCalled();
  });

  it('429 once attempts are used up, even with the right code, and the code is burned', async () => {
    db.otpCode.findFirst.mockResolvedValue(liveOtp('123456', { attempts: 5 }));
    db.otpCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(verifyOtp(EMAIL, '123456')).rejects.toMatchObject({ status: 429 });
    expect(db.otpCode.update).toHaveBeenCalledWith({ where: { id: 'otp-1' }, data: { consumed: true } });
    expect(db.user.upsert).not.toHaveBeenCalled();
  });

  it('400 for an expired code', async () => {
    db.otpCode.findFirst.mockResolvedValue(liveOtp('123456', { expiresAt: new Date(Date.now() - 1000) }));
    await expect(verifyOtp(EMAIL, '123456')).rejects.toMatchObject({ status: 400 });
    expect(db.user.upsert).not.toHaveBeenCalled();
  });

  it('400 when there is no live code', async () => {
    db.otpCode.findFirst.mockResolvedValue(null);
    await expect(verifyOtp(EMAIL, '123456')).rejects.toMatchObject({ status: 400 });
  });

  it('a code that was consumed by a parallel request cannot sign in a second time', async () => {
    db.otpCode.findFirst.mockResolvedValue(liveOtp('123456'));
    db.otpCode.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(verifyOtp(EMAIL, '123456')).rejects.toMatchObject({ status: 400 });
    expect(db.user.upsert).not.toHaveBeenCalled();
  });
});

describe('sign-in by mobile number', () => {
  it('normalises the number to E.164 and sends the code by SMS, not email', async () => {
    db.otpCode.count.mockResolvedValue(0);
    const res = await requestOtp({ phone: '098765 43210' });
    expect(res).toMatchObject({ sent: true, channel: 'phone' });
    expect(db.otpCode.create.mock.calls[0][0].data.identifier).toBe('+919876543210');
    expect(sms.sendOtpSms).toHaveBeenCalledWith('+919876543210', expect.stringMatching(/^\d{6}$/), 10);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('rejects numbers that are not Indian mobiles', async () => {
    await expect(requestOtp({ phone: '12345' })).rejects.toMatchObject({ status: 400 });
    await expect(requestOtp({ phone: '+91 5876543210' })).rejects.toMatchObject({ status: 400 });
  });

  it('creates or finds the user by phone on verify', async () => {
    db.otpCode.findFirst.mockResolvedValue({ ...liveOtp('111111'), identifier: '+919876543210', codeHash: sha256('+919876543210:111111') });
    db.otpCode.updateMany.mockResolvedValue({ count: 1 });
    await verifyOtp({ phone: '9876543210' }, '111111');
    expect(db.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: '+919876543210' } }));
  });
});
