export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const next = source[key];
    if (next !== undefined) sorted[key] = sortValue(next);
  }
  return sorted;
}

export class SectionRevisionTracker {
  private values = new Map<string, string>();
  private revisions = new Map<string, number>();

  revision(key: string, value: unknown): number {
    const serialized = stableStringify(value);
    if (this.values.get(key) !== serialized) {
      this.values.set(key, serialized);
      this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    }
    return this.revisions.get(key) ?? 0;
  }
}
