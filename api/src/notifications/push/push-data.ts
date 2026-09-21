/** FCM/APNs custom data is a flat string map: anything that isn't already a string is JSON-encoded. */
export function toPushData(
  base: Record<string, string>,
  data: Record<string, unknown> | undefined,
): Record<string, string> {
  const result = { ...base };
  for (const [key, value] of Object.entries(data ?? {})) {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return result;
}
