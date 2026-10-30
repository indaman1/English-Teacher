import { WifiOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSavedDataNotice } from '@/pwa/offlineCache';

/** A thin strip shown only while offline. The live lesson screen has its own, more specific message. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const savedAt = useSavedDataNotice();
  const { pathname } = useLocation();
  if (online || pathname === '/practice/live') return null;
  return (
    <div role="status" className="sticky top-0 z-[60] flex items-start justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        You are offline.{' '}
        {savedAt !== null ? 'Showing information saved on this device. ' : ''}
        Voice lessons need an internet connection.
      </span>
    </div>
  );
}
