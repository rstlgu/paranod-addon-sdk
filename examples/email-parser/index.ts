import { ParanodPlugin, createEntity, ResultBuilder } from '../../src';

/**
 * Esempio 1: Plugin Email Parser
 * Transform sincrona che estrae il dominio da un indirizzo email
 *
 * Questo esempio mostra l'approccio SCALABILE dell'SDK:
 * - createEntity() dinamico - funziona con QUALSIASI tipo
 * - Nessuna dipendenza da helper specifici
 * - ID deterministici automatici
 * - ResultBuilder per costruire risultati
 */

const plugin = new ParanodPlugin({
  id: 'email-parser',
  name: 'Email Parser',
  version: '1.0.0',
  author: 'PARANOD Team',
  description: 'Parses email addresses and extracts domain information',
  category: 'identity',
  icon: 'IconMail',
});

// Transform: Estrai dominio da email
plugin.transform({
  id: 'extract-domain',
  name: 'Extract Domain',
  description: 'Extracts domain from email address',
  inputType: 'email',
  outputTypes: ['domain'],

  handler: async (input) => {
    const email = input.entity.value;

    // Valida formato email
    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }

    const domain = email.split('@')[1];

    // Crea l'entità usando createEntity() - scalabile per qualsiasi tipo!
    const domainEntity = createEntity('domain', domain, {
      metadata: {
        source: 'email-parser',
        extractedFrom: email,
      },
    });

    // Usa ResultBuilder per costruire il risultato completo
    // L'edge viene creato automaticamente
    return new ResultBuilder(input)
      .addEntity(domainEntity, 'domain of', {
        relationship: 'belongs_to',
      })
      .setMessage(`Extracted domain: ${domain}`)
      .build();
  },
});

// Avvia server
if (require.main === module) {
  plugin.start({
    port: 3000,
    host: '0.0.0.0',
  });
}

export default plugin;
