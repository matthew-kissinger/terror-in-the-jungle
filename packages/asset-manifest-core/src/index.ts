// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export interface AssetManifestEntry {
  id: string;
  url: string;
  type?: string;
  required?: boolean;
  bytes?: number;
  integrity?: string;
}

export interface AssetManifest {
  version?: string;
  baseUrl?: string;
  assets: AssetManifestEntry[] | Record<string, Omit<AssetManifestEntry, 'id'> | string>;
}

export interface AssetManifestValidationOptions {
  requiredIds?: readonly string[];
  allowedTypes?: readonly string[];
}

export interface AssetManifestValidationResult {
  valid: boolean;
  entries: AssetManifestEntry[];
  errors: string[];
  warnings: string[];
}

export interface ResolveAssetUrlOptions {
  baseUrl?: string;
}

export function normalizeAssetEntries(manifest: AssetManifest): AssetManifestEntry[] {
  if (Array.isArray(manifest.assets)) {
    return manifest.assets.map((entry) => ({ ...entry }));
  }

  return Object.entries(manifest.assets).map(([id, value]) => {
    if (typeof value === 'string') {
      return { id, url: value };
    }
    return { id, ...value };
  });
}

export function validateAssetManifest(
  manifest: AssetManifest,
  options: AssetManifestValidationOptions = {},
): AssetManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries = normalizeAssetEntries(manifest);
  const ids = new Set<string>();
  const allowedTypes = options.allowedTypes ? new Set(options.allowedTypes) : null;

  for (const entry of entries) {
    if (!entry.id.trim()) {
      errors.push('Asset entry has an empty id.');
    }
    if (ids.has(entry.id)) {
      errors.push(`Duplicate asset id: ${entry.id}`);
    }
    ids.add(entry.id);

    if (!entry.url.trim()) {
      errors.push(`Asset ${entry.id} has an empty url.`);
    }
    if (entry.bytes !== undefined && (!Number.isFinite(entry.bytes) || entry.bytes < 0)) {
      errors.push(`Asset ${entry.id} has invalid bytes.`);
    }
    if (allowedTypes && entry.type && !allowedTypes.has(entry.type)) {
      warnings.push(`Asset ${entry.id} has non-allowed type: ${entry.type}`);
    }
  }

  for (const requiredId of options.requiredIds ?? []) {
    if (!ids.has(requiredId)) {
      errors.push(`Missing required asset: ${requiredId}`);
    }
  }

  return {
    valid: errors.length === 0,
    entries,
    errors,
    warnings,
  };
}

export function resolveAssetUrl(
  manifest: AssetManifest,
  id: string,
  options: ResolveAssetUrlOptions = {},
): string {
  const entry = normalizeAssetEntries(manifest).find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Unknown asset id: ${id}`);
  }

  if (/^https?:\/\//i.test(entry.url) || entry.url.startsWith('/')) {
    return entry.url;
  }

  const base = options.baseUrl ?? manifest.baseUrl ?? '';
  if (!base) {
    return entry.url;
  }

  return `${base.replace(/\/+$/, '')}/${entry.url.replace(/^\/+/, '')}`;
}