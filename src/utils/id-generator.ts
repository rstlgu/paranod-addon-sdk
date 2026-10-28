import crypto from 'crypto';
import type { EntityType } from '../core/types';

/**
 * Genera un ID deterministico per un'entità
 * Formato: {type}-{hash-short}
 *
 * @param type - Tipo di entità
 * @param value - Valore dell'entità
 * @returns ID univoco e deterministico
 *
 * @example
 * ```ts
 * generateEntityId('ip', '8.8.8.8')
 * // => "ip-c909e98d"
 *
 * generateEntityId('location', 'Mountain View, CA')
 * // => "location-a3f42bc1"
 * ```
 */
export function generateEntityId(type: EntityType, value: string): string {
  const hash = crypto
    .createHash('md5')
    .update(value.toLowerCase().trim())
    .digest('hex')
    .substring(0, 8);

  return `${type}-${hash}`;
}

/**
 * Genera un ID deterministico per un edge
 * Formato: edge-{hash-short}
 *
 * @param sourceId - ID dell'entità sorgente
 * @param targetId - ID dell'entità target
 * @param label - Label dell'edge (opzionale, per maggiore unicità)
 * @returns ID univoco e deterministico
 *
 * @example
 * ```ts
 * generateEdgeId('ip-c909e98d', 'location-a3f42bc1')
 * // => "edge-4f8a2d1c"
 *
 * generateEdgeId('ip-c909e98d', 'org-5b3c1a2d', 'assigned by')
 * // => "edge-7e9b3f4a"
 * ```
 */
export function generateEdgeId(
  sourceId: string,
  targetId: string,
  label?: string
): string {
  const content = label
    ? `${sourceId}-${targetId}-${label}`
    : `${sourceId}-${targetId}`;

  const hash = crypto
    .createHash('md5')
    .update(content.toLowerCase().trim())
    .digest('hex')
    .substring(0, 8);

  return `edge-${hash}`;
}

/**
 * Genera un ID casuale con prefisso
 * Utile per entità temporanee o quando non serve deterministicità
 *
 * @param prefix - Prefisso per l'ID (es: 'note', 'temp')
 * @returns ID univoco random
 *
 * @example
 * ```ts
 * generateRandomId('note')
 * // => "note-1735123456789"
 * ```
 */
export function generateRandomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Normalizza un valore per la generazione di ID
 * Rimuove spazi extra, converte a lowercase, rimuove caratteri speciali
 *
 * @param value - Valore da normalizzare
 * @returns Valore normalizzato
 *
 * @example
 * ```ts
 * normalizeValue('  Mountain View, CA  ')
 * // => "mountain-view-ca"
 * ```
 */
export function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Valida un ID di entità
 *
 * @param id - ID da validare
 * @returns true se l'ID è valido
 */
export function isValidEntityId(id: string): boolean {
  return id.length > 0 && id.trim() === id;
}

/**
 * Valida un ID di edge
 *
 * @param id - ID da validare
 * @returns true se l'ID è valido
 */
export function isValidEdgeId(id: string): boolean {
  return id.length > 0 && id.trim() === id;
}
