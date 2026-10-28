import { describe, it, expect } from 'vitest';
import { ParanodPlugin } from '../src/core/plugin';

describe('ParanodPlugin', () => {
  it('should create plugin instance', () => {
    const plugin = new ParanodPlugin({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      author: 'Test Author',
      description: 'Test description',
      category: 'network',
    });

    expect(plugin.getConfig().id).toBe('test-plugin');
    expect(plugin.getConfig().name).toBe('Test Plugin');
  });

  it('should register sync transform', () => {
    const plugin = new ParanodPlugin({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      category: 'network',
    });

    plugin.transform({
      id: 'test-transform',
      name: 'Test Transform',
      description: 'Test',
      inputType: 'domain',
      outputTypes: ['ip'],
      handler: async () => ({ entities: [], edges: [] }),
    });

    expect(plugin.hasTransform('test-transform')).toBe(true);
    expect(plugin.isAsyncTransform('test-transform')).toBe(false);
  });

  it('should register async transform', () => {
    const plugin = new ParanodPlugin({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      category: 'network',
    });

    plugin.setWebhookSecret('test-secret');
    plugin.asyncTransform({
      id: 'async-transform',
      name: 'Async Transform',
      description: 'Test',
      inputType: 'domain',
      outputTypes: ['ip'],
      handler: async () => ({ entities: [], edges: [] }),
    });

    expect(plugin.hasTransform('async-transform')).toBe(true);
    expect(plugin.isAsyncTransform('async-transform')).toBe(true);
  });

  it('should prevent duplicate transform IDs', () => {
    const plugin = new ParanodPlugin({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      category: 'network',
    });

    plugin.transform({
      id: 'duplicate',
      name: 'First',
      description: 'Test',
      inputType: 'domain',
      outputTypes: ['ip'],
      handler: async () => ({ entities: [], edges: [] }),
    });

    expect(() => {
      plugin.transform({
        id: 'duplicate',
        name: 'Second',
        description: 'Test',
        inputType: 'domain',
        outputTypes: ['ip'],
        handler: async () => ({ entities: [], edges: [] }),
      });
    }).toThrow();
  });

  it('should generate manifest', () => {
    const plugin = new ParanodPlugin({
      id: 'test',
      name: 'Test Plugin',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      category: 'network',
    });

    plugin.transform({
      id: 'transform1',
      name: 'Transform 1',
      description: 'Test',
      inputType: 'domain',
      outputTypes: ['ip'],
      handler: async () => ({ entities: [], edges: [] }),
    });

    const manifest = plugin.generateManifest({
      endpoint: 'https://api.example.com',
    });

    expect(manifest.manifestVersion).toBe('1.0');
    expect(manifest.plugin.id).toBe('test');
    expect(manifest.plugin.transforms).toHaveLength(1);
    expect(manifest.plugin.transforms[0].id).toBe('transform1');
    expect(manifest.plugin.transforms[0]).not.toHaveProperty('premium');
    expect(manifest.plugin.transforms[0]).not.toHaveProperty('credits');
  });

  it('should mark async transforms in the manifest', () => {
    const plugin = new ParanodPlugin({
      id: 'async-test',
      name: 'Async Test',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      category: 'network',
    });
    plugin.setWebhookSecret('test-secret');
    plugin.asyncTransform({
      id: 'async-transform',
      name: 'Async Transform',
      description: 'Test',
      inputType: 'domain',
      outputTypes: ['ip'],
      handler: async () => ({ entities: [], edges: [] }),
    });

    const manifest = plugin.generateManifest({
      endpoint: 'https://api.example.com',
    });

    expect(manifest.plugin.capabilities.supportsAsync).toBe(true);
    expect(manifest.plugin.transforms[0]).toMatchObject({
      async: true,
    });
  });

  it('requires explicit storage for multi-tenant startup', async () => {
    const plugin = new ParanodPlugin({
      id: 'storage-test',
      name: 'Storage Test',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      category: 'network'
    });

    await expect(
      plugin.start({
        port: 0,
        multiTenant: true,
        installationToken: 'i'.repeat(32)
      })
    ).rejects.toThrow(/persistent installation storage/);
  });
});
