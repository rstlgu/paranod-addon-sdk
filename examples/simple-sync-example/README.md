# Synchronous Transform Example - Domain Info Lookup

> Local transform-authoring example only. It runs without multi-tenant request
> authentication and must not be exposed publicly. Use the repository root
> README or the secure installation example for a deployable addon.

A clear, well-documented example of a synchronous transform demonstrating SDK best practices.

## Overview

This example demonstrates:

- Synchronous transform (response < 30 seconds)
- Creating multiple entity types with `createEntity()`
- Using `ResultBuilder` for clean results
- Automatic edge creation from input to new entities
- Markdown-formatted notes
- Rich, structured metadata
- Scalable approach without type-specific helpers

## Quick Start

```bash
# Install dependencies
npm install

# Start the plugin
npm start
```

The plugin will be available at `http://localhost:3000`

## Testing

```bash
curl -X POST http://localhost:3000/transforms/analyze-domain \
  -H "Content-Type: application/json" \
  -d '{
    "transformId": "analyze-domain",
    "input": {
      "entity": {
        "id": "domain-test-1",
        "type": "domain",
        "value": "google.com"
      }
    },
    "callbackUrl": "https://your-webhook-url.com/callback"
  }'
```

## Result

The plugin returns:

- **1 IP** - Resolved IP address from domain
- **1 Location** - Geolocation of the IP
- **1 Organization** - Hosting provider/ISP
- **1 Note** - Complete analysis report in Markdown

All entities are automatically connected to the input entity with appropriate edges.

## Key Code Patterns

### Scalable Entity Creation

```typescript
// Works with ANY type - even future types!
const ip = createEntity('ip', '8.8.8.8', {
  metadata: { resolvedFrom: domain }
});

const location = createEntity('location', 'Mountain View', {
  metadata: { latitude: 37.386, longitude: -122.084 }
});
```

### Result Builder with Automatic Edges

```typescript
const result = new ResultBuilder(input);

// Add entity + edge in one operation
result.addEntity(ipEntity, 'resolves to', {
  relationship: 'dns_resolution'
});

result.addEntity(locationEntity, 'located in', {
  relationship: 'geolocation'
});

return result
  .setMessage('Analysis complete')
  .build();
```

## Converting to Async

To convert this to an asynchronous transform:

```typescript
// Change from transform() to asyncTransform()
plugin.asyncTransform({
  id: 'analyze-domain',
  // ...

  handler: async (input, config, job) => {
    // Add progress updates
    await job.updateProgress(0, 'Starting...');

    // ... logic ...

    await job.updateProgress(100, 'Complete');
    return result.build();
  }
});

// Add webhook secret
plugin.setWebhookSecret('your-secret');
```

See the `async-subdomain-scanner` example for a complete async implementation.

## Additional Resources

- [Quick Start Guide](../../docs/quick-start.md)
- [Builders Guide](../../docs/builders-guide.md)
- [Response Format](../../docs/response-format.md)
- [Examples Documentation](../../docs/examples.md)
