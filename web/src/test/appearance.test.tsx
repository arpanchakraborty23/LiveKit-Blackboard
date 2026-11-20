import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEffect } from "react";

import { applyAppearance, persistAppearance, readAppearance, useAppearance } from "@/lib/appearance";

// Mirrors how the app wires it: the shell applies the shared settings, the settings page writes them.
function ShellReader() {
  const { appearance } = useAppearance();
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
  return <span data-testid="shell-accent">{appearance.accent}</span>;
}

function SettingsReader() {
  const { appearance, updateAppearance } = useAppearance();
  return (
    <button type="button" onClick={() => updateAppearance({ accent: "ocean" })}>
      Use ocean
    </button>
  );
}

describe("Appearance settings", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset["accent"];
    delete document.documentElement.dataset["density"];
    document.documentElement.classList.remove("dark");
  });

  it("applies an accent chosen on the settings page to the workspace immediately", () => {
    render(
      <>
        <ShellReader />
        <SettingsReader />
      </>,
    );

    fireEvent.click(screen.getByText("Use ocean"));

    expect(document.documentElement.dataset["accent"]).toBe("ocean");
    expect(screen.getByTestId("shell-accent").textContent).toBe("ocean");
  });

  it("preserves the saved theme when changing another appearance setting", () => {
    persistAppearance({ theme: "dark", accent: "mint", density: "compact" });
    render(
      <>
        <ShellReader />
        <SettingsReader />
      </>,
    );

    fireEvent.click(screen.getByText("Use ocean"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset["accent"]).toBe("ocean");
    expect(readAppearance()).toEqual({ theme: "dark", accent: "ocean", density: "compact" });
  });

  it("keeps the accent, theme, and density that were saved", () => {
    persistAppearance({ theme: "dark", accent: "coral", density: "compact" });

    expect(readAppearance()).toEqual({ theme: "dark", accent: "coral", density: "compact" });
  });

  it("falls back to the default accent when a saved value is not one of the choices", () => {
    localStorage.setItem("personal-ai-appearance", JSON.stringify({ accent: "chartreuse" }));

    expect(readAppearance().accent).toBe("mint");
  });
});
