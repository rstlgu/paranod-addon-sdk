import type { OSINTEntity, OSINTEdge, EntityType } from '../core/types';
import { generateEntityId, generateEdgeId } from './id-generator';

/**
 * Crea un'entità OSINT nel formato corretto
 * Genera automaticamente un ID deterministico se non specificato
 *
 * @param type - Tipo di entità
 * @param value - Valore dell'entità (obbligatorio)
 * @param options - Opzioni aggiuntive (label, metadata, id)
 * @returns Entità nel formato corretto
 *
 * @example
 * ```ts
 * // Esempio semplice
 * createEntity('ip', '8.8.8.8')
 *
 * // Con label e metadata
 * createEntity('ip', '8.8.8.8', {
 *   label: 'Google DNS',
 *   metadata: { country: 'US', isp: 'Google LLC' }
 * })
 *
 * // Con ID personalizzato
 * createEntity('location', 'Mountain View, CA', {
 *   id: 'custom-location-id',
 *   metadata: { latitude: 37.386, longitude: -122.084 }
 * })
 * ```
 */
export function createEntity(
  type: EntityType,
  value: string,
  options?: {
    id?: string;
    label?: string;
    metadata?: Record<string, any>;
  }
): OSINTEntity {
  if (!value || value.trim() === '') {
    throw new Error('Entity value cannot be empty');
  }

  return {
    id: options?.id || generateEntityId(type, value),
    type,
    value: value.trim(),
    ...(options?.label && { label: options.label }),
    ...(options?.metadata && { metadata: options.metadata }),
  };
}

/**
 * Crea un edge tra due entità nel formato corretto
 * Genera automaticamente un ID deterministico se non specificato
 *
 * @param sourceId - ID dell'entità sorgente
 * @param targetId - ID dell'entità target
 * @param label - Label visibile dell'edge (obbligatorio)
 * @param options - Opzioni aggiuntive (id, relationship, metadata)
 * @returns Edge nel formato corretto
 *
 * @example
 * ```ts
 * // Esempio semplice
 * createEdge('ip-c909e98d', 'location-a3f42bc1', 'located in')
 *
 * // Con relationship e metadata
 * createEdge('ip-c909e98d', 'org-5b3c1a2d', 'assigned by', {
 *   relationship: 'isp_assignment',
 *   metadata: { confidence: 0.98 }
 * })
 *
 * // Con ID personalizzato
 * createEdge('node-1', 'node-2', 'related to', {
 *   id: 'custom-edge-id'
 * })
 * ```
 */
export function createEdge(
  sourceId: string,
  targetId: string,
  label: string,
  options?: {
    id?: string;
    relationship?: string;
    metadata?: Record<string, any>;
  }
): OSINTEdge {
  if (!sourceId || sourceId.trim() === '') {
    throw new Error('Edge sourceId cannot be empty');
  }
  if (!targetId || targetId.trim() === '') {
    throw new Error('Edge targetId cannot be empty');
  }
  if (!label || label.trim() === '') {
    throw new Error('Edge label cannot be empty');
  }

  return {
    id: options?.id || generateEdgeId(sourceId, targetId, label),
    sourceId: sourceId.trim(),
    targetId: targetId.trim(),
    label: label.trim(),
    ...(options?.relationship && { relationship: options.relationship }),
    ...(options?.metadata && { metadata: options.metadata }),
  };
}

/**
 * NOTA: Gli helper specifici sono stati rimossi per rendere l'SDK più scalabile.
 * Usa `createEntity(type, value, options)` per creare qualsiasi tipo di entità.
 *
 * Esempio:
 * ```ts
 * createEntity('ip', '8.8.8.8', { metadata: { country: 'US' } })
 * createEntity('domain', 'example.com')
 * createEntity('custom-type', 'value')  // Funziona anche con tipi futuri!
 * ```
 */

/**
 * Builder fluente per creare entità complesse
 *
 * @example
 * ```ts
 * const entity = EntityBuilder
 *   .create('ip', '8.8.8.8')
 *   .withLabel('Google DNS')
 *   .withMetadata({ country: 'US', isp: 'Google LLC' })
 *   .build();
 * ```
 */
export class EntityBuilder {
  private entity: Partial<OSINTEntity>;

  private constructor(type: EntityType, value: string) {
    this.entity = {
      type,
      value: value.trim(),
    };
  }

  static create(type: EntityType, value: string): EntityBuilder {
    return new EntityBuilder(type, value);
  }

  withId(id: string): this {
    this.entity.id = id;
    return this;
  }

  withLabel(label: string): this {
    this.entity.label = label;
    return this;
  }

  withMetadata(metadata: Record<string, any>): this {
    this.entity.metadata = { ...this.entity.metadata, ...metadata };
    return this;
  }

  addMetadata(key: string, value: any): this {
    if (!this.entity.metadata) {
      this.entity.metadata = {};
    }
    this.entity.metadata[key] = value;
    return this;
  }

  build(): OSINTEntity {
    if (!this.entity.value) {
      throw new Error('Entity value is required');
    }
    if (!this.entity.type) {
      throw new Error('Entity type is required');
    }

    const id = this.entity.id || generateEntityId(this.entity.type, this.entity.value);

    return {
      id,
      type: this.entity.type,
      value: this.entity.value,
      ...(this.entity.label && { label: this.entity.label }),
      ...(this.entity.metadata && { metadata: this.entity.metadata }),
    };
  }
}

/**
 * Builder fluente per creare edge complessi
 *
 * @example
 * ```ts
 * const edge = EdgeBuilder
 *   .create('ip-abc', 'location-xyz', 'located in')
 *   .withRelationship('geolocation')
 *   .withMetadata({ confidence: 0.98 })
 *   .build();
 * ```
 */
export class EdgeBuilder {
  private edge: Partial<OSINTEdge>;

  private constructor(sourceId: string, targetId: string, label: string) {
    this.edge = {
      sourceId: sourceId.trim(),
      targetId: targetId.trim(),
      label: label.trim(),
    };
  }

  static create(sourceId: string, targetId: string, label: string): EdgeBuilder {
    return new EdgeBuilder(sourceId, targetId, label);
  }

  withId(id: string): this {
    this.edge.id = id;
    return this;
  }

  withRelationship(relationship: string): this {
    this.edge.relationship = relationship;
    return this;
  }

  withMetadata(metadata: Record<string, any>): this {
    this.edge.metadata = { ...this.edge.metadata, ...metadata };
    return this;
  }

  addMetadata(key: string, value: any): this {
    if (!this.edge.metadata) {
      this.edge.metadata = {};
    }
    this.edge.metadata[key] = value;
    return this;
  }

  build(): OSINTEdge {
    if (!this.edge.sourceId) {
      throw new Error('Edge sourceId is required');
    }
    if (!this.edge.targetId) {
      throw new Error('Edge targetId is required');
    }
    if (!this.edge.label) {
      throw new Error('Edge label is required');
    }

    const id = this.edge.id || generateEdgeId(
      this.edge.sourceId,
      this.edge.targetId,
      this.edge.label
    );

    return {
      id,
      sourceId: this.edge.sourceId,
      targetId: this.edge.targetId,
      label: this.edge.label,
      ...(this.edge.relationship && { relationship: this.edge.relationship }),
      ...(this.edge.metadata && { metadata: this.edge.metadata }),
    };
  }
}

/**
 * Helper per validare un array di entità
 * Controlla ID duplicati e campi obbligatori
 */
export function validateEntities(entities: OSINTEntity[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const entity of entities) {
    // Verifica campi obbligatori
    if (!entity.id) {
      errors.push(`Entity missing required field: id`);
    }
    if (!entity.type) {
      errors.push(`Entity missing required field: type`);
    }
    if (!entity.value) {
      errors.push(`Entity missing required field: value`);
    }

    // Verifica ID duplicati
    if (entity.id) {
      if (ids.has(entity.id)) {
        errors.push(`Duplicate entity ID: ${entity.id}`);
      }
      ids.add(entity.id);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper per validare un array di edge
 * Controlla ID duplicati, campi obbligatori e riferimenti validi
 */
export function validateEdges(
  edges: OSINTEdge[],
  entities: OSINTEntity[],
  inputEntityId?: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const edgeIds = new Set<string>();
  const entityIds = new Set(entities.map(e => e.id));

  // Aggiungi l'ID dell'entità di input se fornito
  if (inputEntityId) {
    entityIds.add(inputEntityId);
  }

  for (const edge of edges) {
    // Verifica campi obbligatori
    if (!edge.id) {
      errors.push(`Edge missing required field: id`);
    }
    if (!edge.sourceId) {
      errors.push(`Edge missing required field: sourceId`);
    }
    if (!edge.targetId) {
      errors.push(`Edge missing required field: targetId`);
    }
    if (!edge.label) {
      errors.push(`Edge missing required field: label`);
    }

    // Verifica ID duplicati
    if (edge.id) {
      if (edgeIds.has(edge.id)) {
        errors.push(`Duplicate edge ID: ${edge.id}`);
      }
      edgeIds.add(edge.id);
    }

    // Verifica riferimenti validi
    if (edge.targetId && !entityIds.has(edge.targetId)) {
      errors.push(`Edge references non-existent target entity: ${edge.targetId}`);
    }
    if (edge.sourceId && !entityIds.has(edge.sourceId)) {
      errors.push(`Edge references non-existent source entity: ${edge.sourceId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper per validare una risposta completa di transform
 */
export function validateTransformResult(
  result: { entities: OSINTEntity[]; edges: OSINTEdge[] },
  inputEntityId?: string
): { valid: boolean; errors: string[] } {
  const entityValidation = validateEntities(result.entities);
  const edgeValidation = validateEdges(result.edges, result.entities, inputEntityId);

  return {
    valid: entityValidation.valid && edgeValidation.valid,
    errors: [...entityValidation.errors, ...edgeValidation.errors],
  };
}
