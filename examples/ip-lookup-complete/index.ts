import {
  ParanodPlugin,
  createEntity,
  ResultBuilder,
  EntityBuilder,
} from '../../src';

/**
 * Esempio Completo: IP Lookup Plugin
 *
 * Questo esempio mostra l'approccio SCALABILE e DINAMICO dell'SDK:
 * - createEntity() generico - funziona con QUALSIASI tipo (presente o futuro!)
 * - EntityBuilder per controllo avanzato
 * - ResultBuilder per costruire risultati
 * - ID deterministici automatici
 * - Validazione automatica del formato
 * - Nessuna dipendenza da tipi specifici
 * - Funziona anche con tipi custom non predefiniti
 */

const plugin = new ParanodPlugin({
  id: 'ip-lookup-complete',
  name: 'IP Lookup Complete',
  version: '1.0.0',
  author: 'PARANOD Team',
  description: 'Complete IP address analysis with geolocation, ISP info, and detailed notes',
  category: 'network',
  icon: 'IconMapPin',
  homepage: 'https://example.com/ip-lookup',
  documentation: 'https://docs.example.com/ip-lookup',
});

// Configurazione utente opzionale
plugin.configure({
  apiKey: {
    type: 'string',
    label: 'API Key',
    description: 'Your IPinfo.io API key',
    required: false,
    secret: true,
  },
  includeNotes: {
    type: 'boolean',
    label: 'Include Analysis Notes',
    description: 'Add detailed markdown notes to results',
    default: true,
  },
});

// Transform principale: Analisi IP completa
plugin.transform({
  id: 'analyze-ip',
  name: 'Analyze IP Address',
  description: 'Complete IP analysis with location, ISP, and metadata',
  inputType: 'ip',
  outputTypes: ['location', 'organization', 'note'],

  handler: async (input) => {
    const ip = input.entity.value;

    // Simula chiamata API (sostituire con vera chiamata)
    const mockData = await mockIPLookup(ip);

    // Crea entità Location usando createEntity() - scalabile!
    const locationEntity = createEntity('location', mockData.location.city, {
      label: `${mockData.location.city}, ${mockData.location.region}`,
      metadata: {
        latitude: mockData.location.latitude,
        longitude: mockData.location.longitude,
        country: mockData.location.country,
        countryCode: mockData.location.countryCode,
        region: mockData.location.region,
        timezone: mockData.location.timezone,
      },
    });

    // Crea entità Organization usando EntityBuilder per maggiore controllo
    const orgEntity = EntityBuilder
      .create('organization', mockData.isp.name)
      .withMetadata({
        type: 'isp',
        asn: mockData.isp.asn,
        network: mockData.isp.network,
        domain: mockData.isp.domain,
      })
      .build();

    // Crea una nota dettagliata in markdown (se richiesto)
    const result = new ResultBuilder(input);

    // Aggiungi location con edge
    result.addEntity(locationEntity, 'located in', {
      relationship: 'geolocation',
      metadata: { confidence: 0.98 },
    });

    // Aggiungi ISP con edge
    result.addEntity(orgEntity, 'assigned by', {
      relationship: 'isp_assignment',
    });

    // Aggiungi nota se richiesto
    const includeNotes = input.config?.includeNotes !== false;
    if (includeNotes) {
      const markdown = generateMarkdownReport(ip, mockData);
      const noteEntity = createEntity('note', `IP Analysis: ${ip}`, {
        label: markdown,
        metadata: {
          format: 'markdown',
          tags: ['ip-analysis', 'geolocation', 'isp'],
          timestamp: new Date().toISOString(),
          source: 'ip-lookup-complete',
        },
      });

      result.addEntity(noteEntity, 'analysis', {
        relationship: 'has_analysis',
      });
    }

    return result
      .setMessage(`Successfully analyzed IP ${ip}`)
      .addMetadata('executionTime', Date.now())
      .addMetadata('dataSource', 'ipinfo.io')
      .build();
  },
});

/**
 * Mock function per simulare chiamata API
 * In produzione, sostituire con vera chiamata a servizio IP lookup
 */
async function mockIPLookup(ip: string) {
  // Simula latenza API
  await new Promise(resolve => setTimeout(resolve, 100));

  // Dati mock realistici
  return {
    ip,
    location: {
      city: 'Mountain View',
      region: 'California',
      country: 'United States',
      countryCode: 'US',
      latitude: 37.386,
      longitude: -122.084,
      timezone: 'America/Los_Angeles',
    },
    isp: {
      name: 'Google LLC',
      asn: 'AS15169',
      network: '8.8.8.0/24',
      domain: 'google.com',
    },
    security: {
      isProxy: false,
      isVpn: false,
      isTor: false,
      isHosting: true,
    },
  };
}

/**
 * Genera un report markdown dettagliato
 */
function generateMarkdownReport(ip: string, data: any): string {
  return `## IP Information: ${ip}

### 📍 Location
- **City**: ${data.location.city}
- **Region**: ${data.location.region}
- **Country**: ${data.location.country} (${data.location.countryCode})
- **Coordinates**: ${data.location.latitude}, ${data.location.longitude}
- **Timezone**: ${data.location.timezone}

### 🏢 ISP Information
- **Provider**: ${data.isp.name}
- **ASN**: ${data.isp.asn}
- **Network**: ${data.isp.network}
- **Domain**: ${data.isp.domain}

### 🔒 Security Analysis
- Proxy: ${data.security.isProxy ? '⚠️ Yes' : '✅ No'}
- VPN: ${data.security.isVpn ? '⚠️ Yes' : '✅ No'}
- Tor Exit Node: ${data.security.isTor ? '⚠️ Yes' : '✅ No'}
- Hosting Provider: ${data.security.isHosting ? '✅ Yes' : 'No'}

---

*Analysis performed by IP Lookup Complete Plugin*\u0020\u0020
*Data source: IPinfo.io*\u0020\u0020
*Timestamp: ${new Date().toISOString()}*
`;
}

// Avvia server
if (require.main === module) {
  plugin.start({
    port: 3003,
    host: '0.0.0.0',
  });

  console.log('\n📚 Esempio completo di utilizzo SDK PARANOD');
  console.log('   Questo plugin dimostra:');
  console.log('   ✅ Creazione entità con helper rapidi');
  console.log('   ✅ EntityBuilder per controllo avanzato');
  console.log('   ✅ ResultBuilder per risultati complessi');
  console.log('   ✅ Note in markdown');
  console.log('   ✅ Metadata ricchi');
  console.log('   ✅ ID deterministici automatici\n');
}

export default plugin;
