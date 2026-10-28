import type { OSINTEntity, OSINTEdge, TransformResult, TransformInput } from '../core/types';
import { createEdge } from './builders';

/**
 * Builder per costruire facilmente un TransformResult
 * Gestisce automaticamente gli edge dall'entità di input alle nuove entità
 *
 * @example
 * ```ts
 * const result = new ResultBuilder(input)
 *   .addEntity(createIP('8.8.8.8'), 'resolves to')
 *   .addEntity(createLocation('Mountain View, CA'), 'located in')
 *   .setMessage('Found IP information')
 *   .build();
 * ```
 */
export class ResultBuilder {
  private entities: OSINTEntity[] = [];
  private edges: OSINTEdge[] = [];
  private message?: string;
  private metadata?: Record<string, any>;
  private inputEntityId: string;

  constructor(input: TransformInput) {
    this.inputEntityId = input.entity.id;
  }

  /**
   * Aggiungi un'entità con edge automatico dall'input
   *
   * @param entity - Entità da aggiungere
   * @param edgeLabel - Label dell'edge (opzionale)
   * @param edgeOptions - Opzioni per l'edge
   */
  addEntity(
    entity: OSINTEntity,
    edgeLabel?: string,
    edgeOptions?: {
      relationship?: string;
      metadata?: Record<string, any>;
    }
  ): this {
    this.entities.push(entity);

    // Se viene specificata una label, crea automaticamente l'edge
    if (edgeLabel) {
      const edge = createEdge(
        this.inputEntityId,
        entity.id,
        edgeLabel,
        edgeOptions
      );
      this.edges.push(edge);
    }

    return this;
  }

  /**
   * Aggiungi multiple entità con lo stesso tipo di edge
   *
   * @param entities - Array di entità da aggiungere
   * @param edgeLabel - Label dell'edge (opzionale)
   * @param edgeOptions - Opzioni per l'edge
   */
  addEntities(
    entities: OSINTEntity[],
    edgeLabel?: string,
    edgeOptions?: {
      relationship?: string;
      metadata?: Record<string, any>;
    }
  ): this {
    for (const entity of entities) {
      this.addEntity(entity, edgeLabel, edgeOptions);
    }
    return this;
  }

  /**
   * Aggiungi un'entità senza edge automatico
   */
  addEntityOnly(entity: OSINTEntity): this {
    this.entities.push(entity);
    return this;
  }

  /**
   * Aggiungi un edge manualmente
   */
  addEdge(edge: OSINTEdge): this {
    this.edges.push(edge);
    return this;
  }

  /**
   * Aggiungi multiple edges
   */
  addEdges(edges: OSINTEdge[]): this {
    this.edges.push(...edges);
    return this;
  }

  /**
   * Imposta il messaggio di successo
   */
  setMessage(message: string): this {
    this.message = message;
    return this;
  }

  /**
   * Imposta metadata addizionali
   */
  setMetadata(metadata: Record<string, any>): this {
    this.metadata = metadata;
    return this;
  }

  /**
   * Aggiungi metadata
   */
  addMetadata(key: string, value: any): this {
    if (!this.metadata) {
      this.metadata = {};
    }
    this.metadata[key] = value;
    return this;
  }

  /**
   * Costruisci il risultato finale
   */
  build(): TransformResult {
    return {
      success: true,
      entities: this.entities,
      edges: this.edges,
      ...(this.message && { message: this.message }),
      ...(this.metadata && { metadata: this.metadata }),
    };
  }

  /**
   * Ottieni il numero di entità aggiunte
   */
  getEntityCount(): number {
    return this.entities.length;
  }

  /**
   * Ottieni il numero di edge aggiunti
   */
  getEdgeCount(): number {
    return this.edges.length;
  }

  /**
   * Verifica se ci sono risultati
   */
  hasResults(): boolean {
    return this.entities.length > 0;
  }
}

/**
 * Helper veloce per creare un risultato vuoto (no results)
 */
export function emptyResult(message?: string): TransformResult {
  return {
    success: true,
    entities: [],
    edges: [],
    ...(message && { message }),
  };
}

/**
 * Helper veloce per creare un risultato di errore
 */
export function errorResult(error: string | Error): TransformResult {
  return {
    success: false,
    entities: [],
    edges: [],
    message: error instanceof Error ? error.message : error,
  };
}

/**
 * Helper per creare un risultato con una singola entità
 */
export function singleEntityResult(
  inputEntityId: string,
  entity: OSINTEntity,
  edgeLabel: string,
  options?: {
    relationship?: string;
    message?: string;
    metadata?: Record<string, any>;
  }
): TransformResult {
  const edge = createEdge(inputEntityId, entity.id, edgeLabel, {
    relationship: options?.relationship,
  });

  return {
    success: true,
    entities: [entity],
    edges: [edge],
    ...(options?.message && { message: options.message }),
    ...(options?.metadata && { metadata: options.metadata }),
  };
}

/**
 * Helper per creare un risultato con multiple entità dello stesso tipo
 */
export function multiEntityResult(
  inputEntityId: string,
  entities: OSINTEntity[],
  edgeLabel: string,
  options?: {
    relationship?: string;
    message?: string;
    metadata?: Record<string, any>;
  }
): TransformResult {
  const edges = entities.map(entity =>
    createEdge(inputEntityId, entity.id, edgeLabel, {
      relationship: options?.relationship,
    })
  );

  return {
    success: true,
    entities,
    edges,
    ...(options?.message && { message: options.message }),
    ...(options?.metadata && { metadata: options.metadata }),
  };
}
