import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { RelazioPlugin } from '../src/core/plugin';
import { ExpressServer } from '../src/server/express';
import {
  buildRequestCanonicalPayload,
  HMACUtils
} from '../src/security/hmac';

const installationToken = 'i'.repeat(32);
let activeServer: http.Server | undefined;

afterEach(
  () =>
    new Promise<void>((resolve) => {
      if (!activeServer) {
        resolve();
        return;
      }
      activeServer.close(() => resolve());
      activeServer = undefined;
    })
);

async function createServer() {
  const plugin = new RelazioPlugin({
    id: 'server-test',
    name: 'Server Test',
    version: '1.0.0',
    author: 'Test',
    description: 'Test addon server',
    category: 'network'
  });
  plugin.transform({
    id: 'echo',
    name: 'Echo',
    description: 'Echo input',
    inputType: 'domain',
    outputTypes: ['domain'],
    handler: async (input) => ({
      entities: [input.entity],
      edges: []
    })
  });
  plugin.enableMultiTenantInMemory();

  const adapter = new ExpressServer(plugin, {
    port: 0,
    publicUrl: 'https://addon.example.com',
    multiTenant: true,
    installationToken
  });
  activeServer = http.createServer(adapter.getApp());
  await new Promise<void>((resolve) =>
    activeServer!.listen(0, '127.0.0.1', resolve)
  );
  const address = activeServer.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  return `http://127.0.0.1:${address.port}`;
}

describe('ExpressServer security contract', () => {
  it('protects registration and requires signed, non-replayed transforms', async () => {
    const baseUrl = await createServer();

    const deniedRegistration = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        platformUrl: 'https://platform.example.com'
      })
    });
    expect(deniedRegistration.status).toBe(401);

    const registration = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${installationToken}`
      },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        workspaceName: 'Workspace',
        platformUrl: 'https://platform.example.com',
        platformVersion: '2.0.0'
      })
    });
    expect(registration.status).toBe(200);
    let { webhookSecret } = (await registration.json()) as {
      webhookSecret: string;
    };

    const rotationBody = JSON.stringify({
      workspaceId: 'workspace-1',
      workspaceName: 'Workspace',
      platformUrl: 'https://platform.example.com',
      platformVersion: '2.0.0'
    });
    const unsignedRotation = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${installationToken}`
      },
      body: rotationBody
    });
    expect(unsignedRotation.status).toBe(401);

    const rotationTimestamp = Date.now().toString();
    const rotationNonce = 'b'.repeat(32);
    const rotationSignature = new HMACUtils(webhookSecret).generateHeader(
      buildRequestCanonicalPayload(
        rotationBody,
        'workspace-1',
        rotationTimestamp,
        rotationNonce
      )
    );
    const signedRotation = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${installationToken}`,
        'X-Relazio-Workspace-Id': 'workspace-1',
        'X-Relazio-Timestamp': rotationTimestamp,
        'X-Relazio-Nonce': rotationNonce,
        'X-Relazio-Signature': rotationSignature
      },
      body: rotationBody
    });
    expect(signedRotation.status).toBe(200);
    const rotatedRegistration = (await signedRotation.json()) as {
      webhookSecret: string;
    };
    expect(rotatedRegistration.webhookSecret).not.toBe(webhookSecret);
    webhookSecret = rotatedRegistration.webhookSecret;

    const body = JSON.stringify({
      transformId: 'echo',
      input: {
        entity: {
          id: 'domain-1',
          type: 'domain',
          value: 'example.com'
        }
      },
      callbackUrl: 'https://platform.example.com/api/webhooks/transforms/job'
    });
    const timestamp = Date.now().toString();
    const nonce = 'a'.repeat(32);
    const signature = new HMACUtils(webhookSecret).generateHeader(
      buildRequestCanonicalPayload(body, 'workspace-1', timestamp, nonce)
    );
    const headers = {
      'Content-Type': 'application/json',
      'X-Relazio-Workspace-Id': 'workspace-1',
      'X-Relazio-Timestamp': timestamp,
      'X-Relazio-Nonce': nonce,
      'X-Relazio-Signature': signature
    };

    const execution = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers,
      body
    });
    expect(execution.status).toBe(200);

    const replay = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers,
      body
    });
    expect(replay.status).toBe(409);
  });
});
