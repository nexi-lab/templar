/** Filter out undefined values from a partial config */
export function filterDefined<T extends object>(obj: T | undefined): Partial<T> {
  if (obj === undefined) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
