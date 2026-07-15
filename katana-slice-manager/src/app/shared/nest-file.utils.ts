import { parse } from 'yaml';

export type NestRecord = Record<string, unknown>;

export interface NestSummary {
  sliceName: string;
  coverage: string[];
  nsdReferences: string[];
  infrastructure: NestRecord | null;
}

export function isNestRecord(value: unknown): value is NestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStructuredFile(contents: string): NestRecord {
  const parsed = parse(contents, { maxAliasCount: 20, uniqueKeys: true }) as unknown;

  if (!isNestRecord(parsed)) {
    throw new Error('The file must contain one YAML or JSON object.');
  }

  return parsed;
}

export function summarizeNest(nest: NestRecord): NestSummary {
  const base = asRecord(nest['base_slice_descriptor']);
  const service = asRecord(nest['service_descriptor']);
  const nsList = Array.isArray(service?.['ns_list']) ? service['ns_list'] : [];
  const coverage = toStringList(base?.['coverage'] ?? nest['coverage']);

  return {
    sliceName: firstString(
      nest,
      ['name', 'slice_name', 'sliceName'],
      firstString(base, ['name', 'base_slice_des_id'], 'Unnamed slice')
    ),
    coverage,
    nsdReferences: nsList
      .map((item) => firstString(asRecord(item), ['nsd-id', 'nsd_id', 'nsdId', 'id'], ''))
      .filter(Boolean),
    infrastructure: asRecord(nest['infrastructure'])
  };
}

export function getCredentialReference(infrastructure: NestRecord | null): string {
  return firstString(infrastructure, ['credentials_file', 'credentialsFile'], '');
}

export function firstString(
  record: NestRecord | null,
  keys: string[],
  fallback = ''
): string {
  for (const key of keys) {
    const value = record?.[key];

    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
}

function asRecord(value: unknown): NestRecord | null {
  return isNestRecord(value) ? value : null;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  return value === null || value === undefined || value === '' ? [] : [String(value)];
}
