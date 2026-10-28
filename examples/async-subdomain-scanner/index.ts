import { ParanodPlugin, createEntity, ResultBuilder } from '../../src';

/**
 * 🔄 ESEMPIO ASYNC - Subdomain Scanner
 *
 * Questo esempio mostra come creare un plugin con transform ASINCRONA:
 * - Job che richiede tempo (minuti)
 * - Progress tracking durante l'esecuzione
 * - Webhook callback automatico al completamento
 * - Gestione di risultati multipli
 * - Approccio scalabile con createEntity()
 */

const plugin = new ParanodPlugin({
  id: 'subdomain-scanner',
  name: 'Subdomain Scanner',
  version: '1.0.0',
  author: 'PARANOD Team',
  description: 'Scans for subdomains using certificate transparency logs (async)',
  category: 'network',
  icon: 'IconRadar',
});

// ⚠️ IMPORTANTE: Per async transforms serve webhook secret
plugin.setWebhookSecret(process.env.WEBHOOK_SECRET || 'dev-secret-key');

// Transform ASINCRONA: Subdomain scan
plugin.asyncTransform({
  id: 'scan-subdomains',
  name: 'Scan Subdomains',
  description: 'Finds subdomains via certificate transparency (takes minutes)',
  inputType: 'domain',
  outputTypes: ['domain', 'note'],

  handler: async (input, config, job) => {
    const domain = input.entity.value;

    // 📊 Update progress durante l'esecuzione
    await job.updateProgress(0, 'Starting subdomain scan...');

    // Simula query a certificate transparency logs
    await new Promise(resolve => setTimeout(resolve, 2000));
    await job.updateProgress(25, 'Querying certificate logs...');

    // Simula elaborazione certificati
    await new Promise(resolve => setTimeout(resolve, 2000));
    await job.updateProgress(50, 'Processing certificates...');

    // Mock data - in produzione questi verrebbero da API reali (crt.sh, etc.)
    const mockSubdomains = [
      `www.${domain}`,
      `mail.${domain}`,
      `api.${domain}`,
      `dev.${domain}`,
      `staging.${domain}`,
    ];

    await job.updateProgress(75, 'Deduplicating results...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    await job.updateProgress(100, `Found ${mockSubdomains.length} subdomains`);

    // 🏗️ Costruisci risultato usando approccio scalabile
    const result = new ResultBuilder(input);

    // Aggiungi tutti i subdomains trovati
    const subdomainEntities = mockSubdomains.map(sub =>
      createEntity('domain', sub, {
        metadata: {
          source: 'subdomain-scanner',
          method: 'certificate-transparency',
          discoveryDate: new Date().toISOString(),
        },
      })
    );

    result.addEntities(subdomainEntities, 'subdomain', {
      relationship: 'has_subdomain',
    });

    // Aggiungi nota riassuntiva
    const summaryNote = createEntity('note', 'Subdomain Scan Results', {
      label: `## Subdomain Scan: ${domain}

**Total Found**: ${mockSubdomains.length}
**Method**: Certificate Transparency Logs
**Date**: ${new Date().toISOString()}

### Discovered Subdomains:
${mockSubdomains.map(sub => `- ${sub}`).join('\n')}
`,
      metadata: {
        format: 'markdown',
        totalFound: mockSubdomains.length,
        scanDate: new Date().toISOString(),
      },
    });

    result.addEntity(summaryNote, 'scan report', {
      relationship: 'has_analysis',
    });

    return result
      .setMessage(`Scan complete: ${mockSubdomains.length} subdomains found`)
      .build();
  },
});

// Avvia server
if (require.main === module) {
  plugin.start({
    port: 3002,
    host: '0.0.0.0',
  });

  console.log('\n🔄 ASYNC TRANSFORM EXAMPLE');
  console.log('   Questo plugin dimostra:');
  console.log('   ✅ Transform asincrona con job tracking');
  console.log('   ✅ Progress updates durante esecuzione');
  console.log('   ✅ Webhook automatico al completamento');
  console.log('   ✅ Gestione risultati multipli');
  console.log('   ✅ Approccio scalabile con createEntity()');
  console.log('\n   Test: POST http://localhost:3002/transforms/scan-subdomains');
  console.log('   Body: { "transformId": "scan-subdomains", "input": { "entity": { "id": "test-1", "type": "domain", "value": "example.com" } }, "callbackUrl": "https://your-webhook-url" }\n');
}

export default plugin;
