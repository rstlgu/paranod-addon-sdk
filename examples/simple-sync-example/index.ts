import { ParanodPlugin, createEntity, ResultBuilder } from '../../src';

/**
 * ⚡ ESEMPIO SYNC - Domain Info Lookup
 *
 * Questo esempio mostra come creare un plugin con transform SINCRONA:
 * - Risposta immediata (< 30 secondi)
 * - Creazione di entità multiple
 * - Edge automatici tra entità
 * - Approccio scalabile con createEntity()
 * - Uso di ResultBuilder per risultati puliti
 */

const plugin = new ParanodPlugin({
  id: 'domain-info',
  name: 'Domain Info Lookup',
  version: '1.0.0',
  author: 'Your Name',
  description: 'Analyzes domain and returns IP, location, and organization info',
  category: 'network',
  icon: 'IconWorld',
});

// Transform SINCRONA: Domain analysis
plugin.transform({
  id: 'analyze-domain',
  name: 'Analyze Domain',
  description: 'Gets IP, location, and organization for a domain',
  inputType: 'domain',
  outputTypes: ['ip', 'location', 'organization', 'note'],

  handler: async (input) => {
    const domain = input.entity.value;

    // 1️⃣ Simula risoluzione DNS (in produzione: dns.resolve4())
    const mockIP = '8.8.8.8';

    // 2️⃣ Simula lookup geolocalizzazione (in produzione: API ipinfo.io, etc.)
    const mockGeoData = {
      city: 'Mountain View',
      region: 'California',
      country: 'United States',
      latitude: 37.386,
      longitude: -122.084,
    };

    // 3️⃣ Simula info ISP (in produzione: whois, etc.)
    const mockISPData = {
      name: 'Google LLC',
      asn: 'AS15169',
    };

    // 🏗️ Costruisci risultato con createEntity() - scalabile!
    const result = new ResultBuilder(input);

    // Aggiungi IP trovato
    const ipEntity = createEntity('ip', mockIP, {
      label: `${mockIP} (${domain})`,
      metadata: {
        resolvedFrom: domain,
        recordType: 'A',
      },
    });
    result.addEntity(ipEntity, 'resolves to', {
      relationship: 'dns_resolution',
    });

    // Aggiungi location
    const locationEntity = createEntity('location', mockGeoData.city, {
      label: `${mockGeoData.city}, ${mockGeoData.region}`,
      metadata: {
        latitude: mockGeoData.latitude,
        longitude: mockGeoData.longitude,
        country: mockGeoData.country,
        region: mockGeoData.region,
      },
    });
    result.addEntity(locationEntity, 'located in', {
      relationship: 'geolocation',
    });

    // Aggiungi organization
    const orgEntity = createEntity('organization', mockISPData.name, {
      metadata: {
        asn: mockISPData.asn,
        type: 'isp',
      },
    });
    result.addEntity(orgEntity, 'hosted by', {
      relationship: 'hosting',
    });

    // Aggiungi nota riassuntiva con markdown
    const analysisNote = createEntity('note', `Analysis: ${domain}`, {
      label: `## Domain Analysis: ${domain}

### 🌐 DNS Information
- **IP Address**: ${mockIP}
- **Resolution**: Successful

### 📍 Geolocation
- **City**: ${mockGeoData.city}
- **Region**: ${mockGeoData.region}
- **Country**: ${mockGeoData.country}
- **Coordinates**: ${mockGeoData.latitude}, ${mockGeoData.longitude}

### 🏢 Hosting Provider
- **Provider**: ${mockISPData.name}
- **ASN**: ${mockISPData.asn}

---
*Analysis completed at ${new Date().toISOString()}*
`,
      metadata: {
        format: 'markdown',
        tags: ['domain-analysis', 'dns', 'geolocation'],
        timestamp: new Date().toISOString(),
      },
    });
    result.addEntity(analysisNote, 'analysis report');

    // Ritorna risultato completo
    return result
      .setMessage(`Successfully analyzed ${domain}`)
      .addMetadata('executionTime', Date.now())
      .build();
  },
});

// Avvia server
if (require.main === module) {
  plugin.start({
    port: 3000,
    host: '0.0.0.0',
  });

  console.log('\n⚡ SYNC TRANSFORM EXAMPLE');
  console.log('   Questo plugin dimostra:');
  console.log('   ✅ Transform sincrona (risposta immediata)');
  console.log('   ✅ Creazione di entità multiple (IP, Location, Org, Note)');
  console.log('   ✅ Edge automatici dall\'input alle entità');
  console.log('   ✅ Note in formato Markdown');
  console.log('   ✅ Approccio scalabile con createEntity()');
  console.log('\n   Test: POST http://localhost:3000/transforms/analyze-domain');
  console.log('   Body: { "transformId": "analyze-domain", "input": { "entity": { "id": "test-1", "type": "domain", "value": "google.com" } }, "callbackUrl": "https://your-webhook-url" }\n');
}

export default plugin;
