type TwilioMessageResponse = {
  code?: number;
  message?: string;
  sid?: string;
  status?: string;
};

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !messagingServiceSid) {
    return null;
  }

  return { accountSid, apiKeySid, apiKeySecret, messagingServiceSid };
}

export async function sendTwilioSms({ body, to }: { body: string; to: string }) {
  const twilioConfig = getTwilioConfig();

  if (!twilioConfig) {
    return { ok: false as const, failureMessage: "Twilio SMS is not configured." };
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioConfig.apiKeySid}:${twilioConfig.apiKeySecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        Body: body,
        MessagingServiceSid: twilioConfig.messagingServiceSid,
        To: to,
      }),
      cache: "no-store",
    },
  );
  const result = (await response.json()) as TwilioMessageResponse;

  if (!response.ok || result.code) {
    console.error("Twilio SMS send failed:", result.code ?? response.status);
    return {
      ok: false as const,
      failureMessage: result.message ?? "Twilio SMS send failed.",
    };
  }

  return { ok: true as const, sid: result.sid };
}

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d+]/g, "");
    return digits.length > 8 ? digits : "";
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function appendSmsOptOut(message: string) {
  return /\bstop\b/i.test(message) ? message : `${message}\nReply STOP to opt out.`;
}
