import { useCallback, useEffect, useState } from "react";

export type Appearance = {
  theme: "light" | "dark" | "system";
  accent: string;
  density: "comfortable" | "compact";
};

const STORAGE_KEY = "personal-ai-appearance";
const SYNC_EVENT = "personal-ai-appearance-change";
const ACCENTS = ["mint", "ocean", "coral", "violet"];

export const appearanceDefaults: Appearance = {
  theme: "light",
  accent: "mint",
  density: "comfortable",
};

export function readAppearance(): Appearance {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Appearance> | null;
    return {
      theme: parsed?.theme === "dark" || parsed?.theme === "system" ? parsed.theme : "light",
      accent: ACCENTS.includes(parsed?.accent ?? "") ? parsed?.accent ?? "mint" : "mint",
      density: parsed?.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return appearanceDefaults;
  }
}

export function persistAppearance(appearance: Appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // The current tab still reflects appearance settings when storage is unavailable.
  }
  // Other components reading the same settings (the shell, the settings page) need to
  // re-read them now, not only on the next page load.
  window.dispatchEvent(new Event(SYNC_EVENT));
}

/**
 * Shared appearance state. Every reader stays in sync with the writer, so a change made
 * in Settings applies to the whole workspace immediately instead of on the next reload.
 */
export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(appearanceDefaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAppearance(readAppearance());
    setReady(true);
    const sync = () => setAppearance(readAppearance());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const updateAppearance = useCallback((changes: Partial<Appearance>) => {
    const next = { ...readAppearance(), ...changes };
    setAppearance(next);
    persistAppearance(next);
    applyAppearance(next);
  }, []);

  return { appearance, updateAppearance, ready };
}

/** Applies the stored theme, accent, and density to the document element. */
export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.classList.toggle(
    "dark",
    appearance.theme === "dark" ||
      (appearance.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches),
  );
  root.dataset["accent"] = appearance.accent;
  root.dataset["density"] = appearance.density;
}
