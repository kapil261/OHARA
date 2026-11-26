import { env, features, isProd, isTest } from '../config/env.js';
import { logger } from '../lib/logger.js';

const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

/**
 * Send an SMS through an MSG91 Flow template (India requires DLT-approved templates,
 * so the text lives in the template and we only pass its variables).
 * Without MSG91 configured (local dev only) the message is printed to the console instead.
 * Returns true when MSG91 accepted it.
 */
export async function sendSms(to: string, templateId: string | undefined, vars: Record<string, string>): Promise<boolean> {
  if (!features.sms || !templateId) {
    if (!isProd && !isTest) console.log(`\n[sms:console] To: ${to}\n${JSON.stringify(vars)}\n`);
    return false;
  }
  try {
    const res = await fetch(MSG91_FLOW_URL, {
      method: 'POST',
      headers: { authkey: env.MSG91_AUTH_KEY!, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        ...(env.MSG91_SENDER_ID ? { sender: env.MSG91_SENDER_ID } : {}),
        short_url: '0',
        // MSG91 wants the number without "+".
        recipients: [{ mobiles: to.replace(/^\+/, ''), ...vars }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, 'sms send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'sms send failed');
    return false;
  }
}

export const sendOtpSms = (to: string, code: string, minutes: number) =>
  sendSms(to, env.MSG91_OTP_TEMPLATE_ID, { otp: code, minutes: String(minutes) });

/** Alert template variables: var1 = patient name, var2 = short alert text. */
export const sendAlertSms = (to: string, patientName: string, text: string) =>
  sendSms(to, env.MSG91_ALERT_TEMPLATE_ID, { var1: patientName.slice(0, 30), var2: text.slice(0, 60) });
