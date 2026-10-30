import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { dismissInstallHint, promptInstall, usePwa } from '@/pwa/pwa';

interface Props {
  /** Settings shows the card even when nothing can be done automatically; the dashboard stays quiet. */
  always?: boolean;
}

/** "Install the app" prompt: one-tap on Android/desktop Chrome, step-by-step on iPhone/iPad. */
export function InstallAppCard({ always = false }: Props) {
  const { canInstall, installed, isIOS, dismissed } = usePwa();

  if (installed) {
    return always ? (
      <Card className="flex items-center gap-3 p-4 text-sm text-slate-600">
        <Smartphone className="h-5 w-5 text-emerald-600" aria-hidden /> The app is installed on this device.
      </Card>
    ) : null;
  }
  if (!always && (dismissed || (!canInstall && !isIOS))) return null;

  return (
    <Card className="relative border-brand-200 bg-brand-50/60 p-4 sm:p-5">
      {!always && (
        <button
          type="button"
          onClick={dismissInstallHint}
          aria-label="Not now"
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div className="flex items-start gap-3 pr-6">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">Install English Teacher</h2>
          <p className="mt-0.5 text-sm text-slate-600">Open it from your home screen like any other app, full screen and one tap away.</p>

          {canInstall && (
            <Button className="mt-3" size="sm" onClick={() => void promptInstall()}>
              <Download className="h-4 w-4" aria-hidden /> Install app
            </Button>
          )}

          {!canInstall && isIOS && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>
                Tap the <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" aria-hidden /> <strong>Share</strong> button in Safari.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong>.
              </li>
            </ol>
          )}

          {!canInstall && !isIOS && (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-700">
              <MoreVertical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </span>
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
