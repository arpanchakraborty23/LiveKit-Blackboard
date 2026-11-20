import type { CSSProperties } from 'react';
import { Children, type ReactNode, cloneElement, isValidElement } from 'react';
import { cn } from '@/lib/shadcn/utils';

/**
 * Resizes an array of per-band volume values to exactly `count` entries.
 * Excess values are trimmed from the end; if there are too few, the last
 * value is duplicated to fill the remainder. An empty array is padded with 0s.
 *
 * Shared by the bar, grid and radial audio visualizers.
 */
export function normalizeVolumeBands(bands: number[], count: number): number[] {
  if (bands.length === count) return bands;
  if (bands.length > count) return bands.slice(0, count);
  const lastValue = bands[bands.length - 1] ?? 0;
  return [...bands, ...new Array(count - bands.length).fill(lastValue)];
}

/**
 * Clones a single React child, merging `className` and `style` with the
 * provided `props` so the caller can inject data attributes without losing
 * the child's own classes/styles.
 */
export function cloneSingleChild(
  children: ReactNode | ReactNode[],
  props?: Record<string, unknown>,
  key?: unknown
) {
  return Children.map(children, (child) => {
    // Checking isValidElement is the safe way and avoids a typescript error too.
    if (isValidElement(child) && Children.only(children)) {
      const childProps = child.props as Record<string, unknown>;
      if (childProps.className) {
        // make sure we retain classnames of both passed props and child
        props ??= {};
        props.className = cn(childProps.className as string, props.className as string);
        props.style = {
          ...(childProps.style as CSSProperties),
          ...(props.style as CSSProperties),
        };
      }
      return cloneElement(child, { ...props, key: key ? String(key) : undefined });
    }
    return child;
  });
}
