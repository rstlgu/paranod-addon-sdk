import crypto from 'crypto';

/**
 * Utility per gestire la firma HMAC-SHA256
 */
export class HMACUtils {
  private secret: string;

  constructor(secret: string) {
    if (!secret) {
      throw new Error('HMAC secret is required');
    }
    this.secret = secret;
  }

  /**
   * Genera signature HMAC-SHA256 per un payload
   */
  sign(payload: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verifica una signature HMAC (timing-safe)
   */
  verify(payload: string, signature: string): boolean {
    const expected = this.sign(payload);

    try {
      // Timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  /**
   * Genera header signature per webhook
   */
  generateHeader(payload: string): string {
    const signature = this.sign(payload);
    return `sha256=${signature}`;
  }

  /**
   * Estrae signature da header
   */
  static extractSignature(header: string | null): string | null {
    if (!header) return null;

    const match = header.match(/^sha256=([a-f0-9]{64})$/i);
    return match ? match[1] : null;
  }
}

export function buildRequestCanonicalPayload(
  body: string,
  workspaceId: string,
  timestamp: string,
  nonce: string
): string {
  return `${timestamp}.${nonce}.${workspaceId}.${body}`;
}

export function verifyPlatformRequestSignature(input: {
  body: string;
  workspaceId: string;
  timestamp: string;
  nonce: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  return verifyWebhookSignature(
    buildRequestCanonicalPayload(
      input.body,
      input.workspaceId,
      input.timestamp,
      input.nonce
    ),
    input.signatureHeader,
    input.secret
  );
}

/**
 * Verifica signature da webhook ricevuto
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  const signature = HMACUtils.extractSignature(signatureHeader);
  if (!signature) return false;

  const hmac = new HMACUtils(secret);
  return hmac.verify(payload, signature);
}
