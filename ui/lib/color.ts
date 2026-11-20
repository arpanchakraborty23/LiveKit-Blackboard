export const DEFAULT_COLOR = '#1FD5F9';

/**
 * Parses a hex color string (`#rrggbb`) into an `[r, g, b]` array with
 * channels normalized to 0..1. Falls back to `DEFAULT_COLOR` on invalid input.
 *
 * Shared by the wave and aura shader-based audio visualizers.
 */
export function hexToRgb(hexColor: string): number[] {
  try {
    const rgbColor = hexColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);

    if (rgbColor) {
      const [, r, g, b] = rgbColor;
      const color = [r, g, b].map((c = '00') => parseInt(c, 16) / 255);

      return color;
    }
  } catch {
    console.error(
      `Invalid hex color '${hexColor}'.\nFalling back to default color '${DEFAULT_COLOR}'.`
    );
  }

  return hexToRgb(DEFAULT_COLOR);
}
