import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import Logo from './Logo';

/**
 * Mobil tarayıcıda açanlara: "Uygulamayı Ana Ekrana Ekle (Tam Ekran Kullan)".
 * Android/Chrome'da yerleşik kurulum penceresini açar; iOS Safari'de Paylaş → Ana Ekrana Ekle talimatı gösterir.
 * Kapatılınca 14 gün gösterilmez; uygulama ana ekrandan açıldığında hiç görünmez.
 */
export default function InstallBanner({ hidden = false }: { hidden?: boolean }) {
  const { mode, install, dismiss } = useInstallPrompt();
  // Açılışta haritayı hemen kapatmasın: kısa bir gecikmeyle belirsin
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  if (!mode || !ready || hidden) return null;

  return (
    <div
      role="dialog"
      aria-label="Uygulamayı ana ekrana ekle"
      className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[55] animate-slide-up rounded-3xl bg-night p-3.5 text-white shadow-2xl ring-1 ring-white/10"
    >
      <div className="flex items-start gap-3">
        <Logo size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-tight">Uygulamayı Ana Ekrana Ekle</p>
          {mode === 'prompt' ? (
            <p className="mt-0.5 text-xs text-white/70">Adres çubuğu olmadan, gerçek bir uygulama gibi tam ekran kullanın.</p>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-white/75">
              Tam ekran kullanmak için alttaki <Share size={13} className="inline -translate-y-px" aria-label="Paylaş" /> <b>Paylaş</b> simgesine dokunun, ardından{' '}
              <SquarePlus size={13} className="inline -translate-y-px" aria-hidden /> <b>Ana Ekrana Ekle</b>’yi seçin.
            </p>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="Kapat" className="-m-1 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
          <X size={18} />
        </button>
      </div>
      {mode === 'prompt' ? (
        <button
          type="button"
          onClick={() => void install()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-onbrand transition hover:bg-brand-dark active:scale-[.98]"
        >
          <Download size={17} /> Ana Ekrana Ekle (Tam Ekran Kullan)
        </button>
      ) : (
        <button type="button" onClick={dismiss} className="mt-3 w-full rounded-2xl bg-white/10 py-2.5 text-sm font-bold hover:bg-white/15">
          Anladım
        </button>
      )}
    </div>
  );
}
