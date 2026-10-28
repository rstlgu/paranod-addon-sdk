import { describe, it, expect } from 'vitest';
import { HMACUtils, verifyWebhookSignature } from '../src/security/hmac';

describe('HMACUtils', () => {
  const secret = 'test-secret-key';
  const hmac = new HMACUtils(secret);

  it('should generate consistent signatures', () => {
    const payload = 'test payload';
    const sig1 = hmac.sign(payload);
    const sig2 = hmac.sign(payload);
    expect(sig1).toBe(sig2);
  });

  it('should verify valid signatures', () => {
    const payload = 'test payload';
    const signature = hmac.sign(payload);
    expect(hmac.verify(payload, signature)).toBe(true);
  });

  it('should reject invalid signatures', () => {
    const payload = 'test payload';
    const invalidSignature = 'invalid';
    expect(hmac.verify(payload, invalidSignature)).toBe(false);
  });

  it('should generate header with sha256 prefix', () => {
    const payload = 'test';
    const header = hmac.generateHeader(payload);
    expect(header).toMatch(/^sha256=[a-f0-9]+$/);
  });

  it('should extract signature from header', () => {
    const signature = 'a'.repeat(64);
    const header = `sha256=${signature}`;
    const sig = HMACUtils.extractSignature(header);
    expect(sig).toBe(signature);
  });

  it('should return null for invalid header', () => {
    expect(HMACUtils.extractSignature(null)).toBeNull();
    expect(HMACUtils.extractSignature('invalid')).toBeNull();
  });

  it('should verify webhook signatures', () => {
    const payload = JSON.stringify({ test: 'data' });
    const header = hmac.generateHeader(payload);
    expect(verifyWebhookSignature(payload, header, secret)).toBe(true);
  });
});
