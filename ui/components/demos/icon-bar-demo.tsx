'use client';

import { useState } from 'react';
import { Building2, Cloud, GraduationCap, Sun } from 'lucide-react';
import { IconBar, IconBarItem } from '@/components/ui/icon-bar';

/**
 * Preview of the shared IconBar component.
 *
 * The bar is controlled here only so the selection is inspectable next to it; in the app it
 * usually behaves uncontrolled and just calls `onValueChange`.
 */
export function IconBarPreview() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <IconBar onValueChange={setSelected}>
        <IconBarItem icon={Building2} label="Office" />
        <IconBarItem icon={GraduationCap} label="School" />
        <IconBarItem icon={Sun} label="Sunny" />
        <IconBarItem icon={Cloud} label="Cloudy" />
      </IconBar>

      <p className="text-muted-foreground text-sm">
        Selected: <span className="text-foreground font-medium">{selected ?? 'none'}</span>
      </p>
    </div>
  );
}

export default IconBarPreview;
