import { useCallback, useEffect, useState } from 'react';

/** Chrome/Edge/Samsung Internet'in kurulum olayı (standart tip tanımı yok) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'tn.installDismissedAt';
/** Kapatılan yönlendirme bu süre sonra yeniden gösterilir */
export const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/** Uygulama ana ekrandan (tam ekran) mı açıldı? */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari: beforeinstallprompt yok; kullanıcı Paylaş → Ana Ekrana Ekle ile kurar */
export function isIosSafari(ua = navigator.userAgent): boolean {
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\//i.test(ua);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

/**
 * Ana ekrana ekleme durumu.
 * - mode 'prompt': tarayıcı yerleşik kurulum penceresini destekliyor (beforeinstallprompt yakalandı)
 * - mode 'ios': iOS Safari — elle ekleme talimatı gösterilir
 * - mode null: gösterilecek bir şey yok (zaten kurulu, kapatılmış ya da desteklenmiyor)
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(recentlyDismissed);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // tarayıcının kendi mini çubuğu yerine bizim yönlendirmemiz
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onMode = () => setInstalled(isStandalone());
    mq?.addEventListener?.('change', onMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onMode);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* gizli sekme */
    }
  }, []);

  /** Yerleşik kurulum penceresini açar; olay yalnızca bir kez kullanılabilir */
  const install = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'dismissed') dismiss();
    return outcome;
  }, [deferred, dismiss]);

  const mode = installed || dismissed ? null : deferred ? ('prompt' as const) : isIosSafari() ? ('ios' as const) : null;
  return { mode, install, dismiss };
}
