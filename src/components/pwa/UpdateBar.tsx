import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { applyUpdate, usePwa } from '@/pwa/pwa';

/** Shown only when a newer version has already been downloaded. Never appears during a lesson (that screen has no app shell). */
export function UpdateBar() {
  const { updateReady } = usePwa();
  if (!updateReady) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:bottom-4"
    >
      <span>A new version is ready.</span>
      <Button size="sm" variant="secondary" onClick={applyUpdate}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Update
      </Button>
    </div>
  );
}
