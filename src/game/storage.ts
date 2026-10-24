export interface Saved {
  best: Record<string, number>;
  muted: boolean;
  lastLevel?: string;
}
export const STORAGE_KEY = "cut-the-signal:v1";
export function readSaved(storage: Pick<Storage, "getItem">): Saved {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { best: {}, muted: true };
    const best: Record<string, number> = {};
    if (
      data.best &&
      typeof data.best === "object" &&
      !Array.isArray(data.best)
    ) {
      for (const [id, value] of Object.entries(data.best)) {
        if (
          typeof value === "number" &&
          Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= 1000
        )
          best[id] = value;
      }
    }
    return {
      best,
      muted: typeof data.muted === "boolean" ? data.muted : true,
      ...(typeof data.lastLevel === "string" &&
      /^[a-z0-9-]{1,80}$/.test(data.lastLevel)
        ? { lastLevel: data.lastLevel }
        : {}),
    };
  } catch {
    return { best: {}, muted: true };
  }
}
