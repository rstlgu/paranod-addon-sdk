import { ParanodPlugin, createEntity, ResultBuilder } from '../../src';
import dns from 'dns/promises';

/**
 * Esempio 2: DNS Toolkit
 * Plugin con multiple transforms sincrone per analisi DNS
 *
 * Questo esempio mostra:
 * - createEntity() dinamico per qualsiasi tipo
 * - Gestione di multiple entità dello stesso tipo
 * - ResultBuilder per risultati complessi
 * - Approccio scalabile senza dipendenze da tipi specifici
 */

const plugin = new ParanodPlugin({
  id: 'dns-toolkit',
  name: 'DNS Toolkit',
  version: '1.0.0',
  author: 'PARANOD Team',
  description: 'Complete DNS analysis toolkit with A, MX, NS records',
  category: 'network',
  icon: 'IconNetwork',
});

// Transform 1: A Records (IPv4)
plugin.transform({
  id: 'resolve-a',
  name: 'Resolve A Records',
  description: 'Gets IPv4 addresses for a domain',
  inputType: 'domain',
  outputTypes: ['ip'],

  handler: async (input) => {
    const domain = input.entity.value;

    try {
      const ips = await dns.resolve4(domain);

      // Crea le entità IP usando createEntity()
      const ipEntities = ips.map(ip =>
        createEntity('ip', ip, {
          metadata: {
            source: 'dns-toolkit',
            recordType: 'A',
          },
        })
      );

      // Usa ResultBuilder per aggiungere tutte le entità con lo stesso edge
      return new ResultBuilder(input)
        .addEntities(ipEntities, 'resolves to', {
          relationship: 'resolves_to',
        })
        .setMessage(`Found ${ips.length} A record(s)`)
        .build();
    } catch (error) {
      throw new Error(`DNS resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

// Transform 2: MX Records (Mail servers)
plugin.transform({
  id: 'resolve-mx',
  name: 'Get MX Records',
  description: 'Gets mail server information',
  inputType: 'domain',
  outputTypes: ['domain', 'note'],

  handler: async (input) => {
    const domain = input.entity.value;

    try {
      const mxRecords = await dns.resolveMx(domain);

      // Crea le entità domain con label e metadata personalizzati
      const mailServers = mxRecords.map((mx) =>
        createEntity('domain', mx.exchange, {
          label: `${mx.exchange} (priority: ${mx.priority})`,
          metadata: {
            source: 'dns-toolkit',
            recordType: 'MX',
            priority: mx.priority,
          },
        })
      );

      return new ResultBuilder(input)
        .addEntities(mailServers, 'mail server', {
          relationship: 'uses_mailserver',
        })
        .setMessage(`Found ${mxRecords.length} MX record(s)`)
        .build();
    } catch (error) {
      throw new Error(`MX lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

// Transform 3: NS Records (Nameservers)
plugin.transform({
  id: 'resolve-ns',
  name: 'Get Nameservers',
  description: 'Gets authoritative nameservers',
  inputType: 'domain',
  outputTypes: ['domain'],

  handler: async (input) => {
    const domain = input.entity.value;

    try {
      const nameservers = await dns.resolveNs(domain);

      // Crea le entità nameserver
      const nsEntities = nameservers.map((ns) =>
        createEntity('domain', ns, {
          metadata: {
            source: 'dns-toolkit',
            recordType: 'NS',
          },
        })
      );

      return new ResultBuilder(input)
        .addEntities(nsEntities, 'nameserver', {
          relationship: 'uses_nameserver',
        })
        .setMessage(`Found ${nameservers.length} nameserver(s)`)
        .build();
    } catch (error) {
      throw new Error(`NS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

// Avvia server
if (require.main === module) {
  plugin.start({
    port: 3001,
    host: '0.0.0.0',
  });
}

export default plugin;
