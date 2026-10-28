# Builders Guide

This guide provides detailed documentation on using the SDK's builder utilities to create entities, edges, and transform results.

## Overview

The SDK provides a consistent, typed approach to creating plugin responses:

- **createEntity()**: Universal entity creation function
- **createEdge()**: Edge creation with validation
- **ResultBuilder**: Fluent builder for complex results
- **EntityBuilder**: Advanced entity construction
- **EdgeBuilder**: Advanced edge construction

## createEntity() - Universal Approach

The `createEntity()` function works with every type in the exported
`EntityType` union, eliminating the need for type-specific helpers.

### Signature

```typescript
createEntity(
  type: EntityType,
  value: string,
  options?: {
    id?: string;
    label?: string;
    metadata?: Record<string, any>;
  }
): OSINTEntity
```

### Examples

```typescript
import { createEntity } from "@paranod/plugin-sdk";

// IP address
const ip = createEntity("ip", "8.8.8.8", {
  label: "Google DNS",
  metadata: { country: "US", isp: "Google LLC" },
});

// Domain
const domain = createEntity("domain", "google.com", {
  metadata: { tld: "com", registrar: "MarkMonitor" },
});

// Email
const email = createEntity("email", "user@example.com", {
  metadata: { verified: true },
});

// Location
const location = createEntity("location", "New York, NY", {
  metadata: {
    latitude: 40.7128,
    longitude: -74.006,
    country: "United States",
  },
});

// Organization
const org = createEntity("organization", "Google LLC", {
  metadata: {
    industry: "Technology",
    website: "google.com",
  },
});

// Note with Markdown
const note = createEntity("note", "Analysis Results", {
  label: "## Analysis\n\n**Result**: Success",
  metadata: {
    format: "markdown",
    tags: ["analysis", "report"],
  },
});

// Unsupported classifications use the explicit custom type.
const customEntity = createEntity("custom", "value", {
  metadata: { originalType: "my-custom-type" },
});
```

### Advantages

- **Scalable**: One builder covers the complete `EntityType` union
- **Flexible**: `custom` preserves unsupported classifications in metadata
- **Consistent**: Same syntax for all types
- **Type-safe**: TypeScript validation for known types
- **Versioned**: New dedicated types require an SDK type update

## EntityBuilder - Advanced Construction

For complex entities requiring fine-grained control, use the EntityBuilder class.

### Example

```typescript
import { EntityBuilder } from "@paranod/plugin-sdk";

const entity = EntityBuilder.create("ip", "8.8.8.8")
  .withLabel("Google DNS")
  .withMetadata({ country: "US" })
  .addMetadata("isp", "Google LLC")
  .addMetadata("asn", "AS15169")
  .build();
```

## createEdge() - Edge Creation

Creates edges between entities with automatic ID generation.

### Signature

```typescript
createEdge(
  sourceId: string,
  targetId: string,
  label: string,
  options?: {
    id?: string;
    relationship?: string;
    metadata?: Record<string, any>;
  }
): OSINTEdge
```

### Examples

```typescript
import { createEdge } from "@paranod/plugin-sdk";

// Simple edge
const edge = createEdge("ip-abc123", "location-xyz", "located in");

// Edge with relationship and metadata
const edge = createEdge("ip-abc123", "org-google", "assigned by", {
  relationship: "isp_assignment",
  metadata: { confidence: 0.98 },
});
```

## ResultBuilder - Automated Result Construction

ResultBuilder simplifies creating transform results by automatically generating edges from the input entity to created entities.

### Basic Usage

```typescript
import { ResultBuilder } from "@paranod/plugin-sdk";

handler: async (input) => {
  const entity = createEntity("ip", "8.8.8.8");

  return new ResultBuilder(input)
    .addEntity(entity, "resolves to")
    .setMessage("Resolution successful")
    .build();
};
```

### Adding Single Entities

```typescript
const result = new ResultBuilder(input);

result.addEntity(entity, "edge label", {
  relationship: "custom_relationship",
  metadata: { confidence: 0.95 },
});

return result.setMessage("Operation completed").build();
```

### Adding Multiple Entities

```typescript
const result = new ResultBuilder(input);

const entities = ["1.1.1.1", "8.8.8.8"].map((ip) => createEntity("ip", ip));

result.addEntities(entities, "resolves to", {
  relationship: "dns_resolution",
});

return result.build();
```

### Adding Entities Without Edges

```typescript
const result = new ResultBuilder(input);

// Add entity without creating an edge
result.addEntityOnly(entity);

return result.build();
```

### Adding Custom Edges

```typescript
const result = new ResultBuilder(input);

result.addEntityOnly(entity1);
result.addEntityOnly(entity2);

// Create custom edge between entities
const edge = createEdge(entity1.id, entity2.id, "related to");
result.addEdge(edge);

return result.build();
```

### Adding Metadata

```typescript
return new ResultBuilder(input)
  .addEntity(entity, "label")
  .setMessage("Success")
  .addMetadata("executionTime", 123)
  .addMetadata("source", "api.example.com")
  .build();
```

## Common Patterns

### Pattern 1: IP Geolocation Lookup

```typescript
handler: async (input) => {
  const ip = input.entity.value;
  const data = await lookupIP(ip);

  const location = createEntity("location", data.city, {
    metadata: {
      latitude: data.lat,
      longitude: data.lon,
      country: data.country,
    },
  });

  const org = createEntity("organization", data.isp, {
    metadata: { asn: data.asn },
  });

  return new ResultBuilder(input)
    .addEntity(location, "located in", {
      relationship: "geolocation",
    })
    .addEntity(org, "assigned by", {
      relationship: "isp_assignment",
    })
    .setMessage(`Analyzed IP ${ip}`)
    .build();
};
```

### Pattern 2: DNS Resolution

```typescript
handler: async (input) => {
  const domain = input.entity.value;
  const ips = await resolveDomain(domain);

  const ipEntities = ips.map((ip) =>
    createEntity("ip", ip, {
      metadata: { recordType: "A" },
    }),
  );

  return new ResultBuilder(input)
    .addEntities(ipEntities, "resolves to", {
      relationship: "dns_resolution",
    })
    .setMessage(`Found ${ips.length} IP address(es)`)
    .build();
};
```

### Pattern 3: Analysis with Markdown Notes

```typescript
handler: async (input) => {
  const data = await analyze(input.entity.value);

  const markdown = `
## Analysis Results

**Status**: ${data.status}
**Score**: ${data.score}/100

### Details
- Finding 1: ${data.finding1}
- Finding 2: ${data.finding2}
  `;

  const note = createEntity("note", "Analysis Report", {
    label: markdown,
    metadata: {
      format: "markdown",
      tags: ["analysis", "report"],
      timestamp: new Date().toISOString(),
    },
  });

  return new ResultBuilder(input).addEntity(note, "analysis").build();
};
```

### Pattern 4: Empty Results

```typescript
import { emptyResult } from "@paranod/plugin-sdk";

handler: async (input) => {
  const results = await search(input.entity.value);

  if (results.length === 0) {
    return emptyResult("No results found");
  }

  // Process results...
};
```

### Pattern 5: Error Handling

```typescript
import { errorResult } from "@paranod/plugin-sdk";

handler: async (input) => {
  try {
    // Transform logic
  } catch (error) {
    throw error; // SDK handles automatically

    // Or use errorResult for custom handling
    return errorResult(error);
  }
};
```

## Validation

The SDK automatically validates responses, but manual validation is available.

```typescript
import { validateTransformResult } from "@paranod/plugin-sdk";

const result = {
  entities: [
    /* ... */
  ],
  edges: [
    /* ... */
  ],
};

const validation = validateTransformResult(result, input.entity.id);

if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}
```

## ID Generation

IDs are generated automatically using deterministic hashing, but can be customized.

```typescript
import { generateEntityId, generateEdgeId } from "@paranod/plugin-sdk";

// Deterministic entity ID
const id = generateEntityId("ip", "8.8.8.8");
// Returns: "ip-c909e98d"

// Deterministic edge ID
const edgeId = generateEdgeId("source-id", "target-id", "label");
// Returns: "edge-4f8a2d1c"

// Custom ID
const entity = createEntity("ip", "8.8.8.8", {
  id: "my-custom-id",
});
```

## Best Practices

### Recommended Approach

```typescript
// Use createEntity() for scalability
const ip = createEntity("ip", "8.8.8.8");

// Use ResultBuilder for complex results
return new ResultBuilder(input).addEntity(location, "located in").build();

// Add meaningful metadata
createEntity("location", "NYC", {
  metadata: { latitude: 40.7, longitude: -74.0 },
});

// Use descriptive labels
createEntity("domain", "mx1.google.com", {
  label: "mx1.google.com (priority: 10)",
});

// Use the explicit custom type for unsupported classifications.
createEntity("custom", "value", {
  metadata: { originalType: "my-custom-type" },
});
```

### Common Mistakes

```typescript
// Incorrect: Creating entities manually without IDs
const entity = { type: "ip", value: "8.8.8.8" };

// Correct: Use createEntity()
const entity = createEntity("ip", "8.8.8.8");

// Incorrect: Empty edge label
createEdge("source-id", "target-id", "");

// Correct: Descriptive label
createEdge("source-id", "target-id", "related to");
```

## Helper Functions

### Result Helpers

```typescript
// Empty result
emptyResult(message?: string): TransformResult

// Error result
errorResult(error: string | Error): TransformResult

// Single entity result
singleEntityResult(
  inputEntityId: string,
  entity: OSINTEntity,
  edgeLabel: string,
  options?: {
    relationship?: string;
    message?: string;
    metadata?: Record<string, any>;
  }
): TransformResult

// Multi-entity result
multiEntityResult(
  inputEntityId: string,
  entities: OSINTEntity[],
  edgeLabel: string,
  options?: {
    relationship?: string;
    message?: string;
    metadata?: Record<string, any>;
  }
): TransformResult
```

### Validation Helpers

```typescript
validateEntities(entities: OSINTEntity[]): { valid: boolean; errors: string[] }

validateEdges(
  edges: OSINTEdge[],
  entities: OSINTEntity[],
  inputEntityId?: string
): { valid: boolean; errors: string[] }

validateTransformResult(
  result: { entities: OSINTEntity[]; edges: OSINTEdge[] },
  inputEntityId?: string
): { valid: boolean; errors: string[] }
```

### ID Generation Helpers

```typescript
generateEntityId(type: EntityType, value: string): string

generateEdgeId(sourceId: string, targetId: string, label?: string): string

generateRandomId(prefix: string): string

normalizeValue(value: string): string

isValidEntityId(id: string): boolean

isValidEdgeId(id: string): boolean
```

## Additional Resources

- [Quick Start Guide](./quick-start.md)
- [Response Format Specification](./response-format.md)
- [Examples Documentation](./examples.md)
- [Main README](../README.md)
