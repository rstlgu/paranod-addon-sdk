import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EncryptedFileStorage,
  InstallationRegistry
} from '../src/registry/installation';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe('InstallationRegistry', () => {
  it('uses workspaceId and rotates the secret on re-registration', async () => {
    const registry = new InstallationRegistry('test-addon', '1.0.0');
    const request = {
      workspaceId: 'workspace-1',
      workspaceName: 'Workspace',
      platformUrl: 'https://platform.example.com/path',
      platformVersion: '2.0.0',
    };

    const first = await registry.register(request);
    const second = await registry.register(request);
    const installation = await registry.getInstallation('workspace-1');

    expect(first.webhookSecret).not.toBe(second.webhookSecret);
    expect(installation).toMatchObject({
      workspaceId: 'workspace-1',
      platformUrl: 'https://platform.example.com/path',
      webhookSecret: second.webhookSecret,
    });
  });

  it('persists installation secrets encrypted at rest', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'relazio-sdk-')
    );
    const filePath = path.join(temporaryDirectory, 'installations.enc');
    const key = 'k'.repeat(32);
    const storage = new EncryptedFileStorage(filePath, key);
    const registry = new InstallationRegistry(
      'test-addon',
      '1.0.0',
      storage
    );

    const registration = await registry.register({
      workspaceId: 'workspace-1',
      platformUrl: 'https://platform.example.com'
    });
    const serialized = await fs.readFile(filePath, 'utf8');

    expect(serialized).not.toContain(registration.webhookSecret);
    expect(serialized).not.toContain('workspace-1');

    const reloaded = new InstallationRegistry(
      'test-addon',
      '1.0.0',
      new EncryptedFileStorage(filePath, key)
    );
    expect(await reloaded.getSecret('workspace-1')).toBe(
      registration.webhookSecret
    );
    expect(
      (await reloaded.getInstallation('workspace-1'))?.installedAt
    ).toBeInstanceOf(Date);
  });

  it('fails closed when the encrypted storage key changes', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'relazio-sdk-')
    );
    const filePath = path.join(temporaryDirectory, 'installations.enc');
    const registry = new InstallationRegistry(
      'test-addon',
      '1.0.0',
      new EncryptedFileStorage(filePath, 'a'.repeat(32))
    );
    await registry.register({
      workspaceId: 'workspace-1',
      platformUrl: 'https://platform.example.com'
    });

    const changedKeyStorage = new EncryptedFileStorage(
      filePath,
      'b'.repeat(32)
    );
    await expect(changedKeyStorage.getAll()).rejects.toThrow();
  });
});
