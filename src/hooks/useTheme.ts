import { useEffect, useState } from 'react';
import { themeColorFor } from '../lib/themeColors';

export type ThemeSetting = 'system' | 'light' | 'dark';
const KEY = 'tn.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readSetting(): ThemeSetting {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(setting: ThemeSetting) {
  const dark = setting === 'dark' || (setting === 'system' && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', dark);
  // Durum çubuğu uygulama zemini rengini alır (sarı değil)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColorFor(dark));
}

/** Sistem / Açık / Koyu. Varsayılan sistem teması; seçim tn.theme anahtarında saklanır. */
export function useTheme() {
  const [setting, setSetting] = useState<ThemeSetting>(readSetting);

  useEffect(() => {
    apply(setting);
    try {
      if (setting === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, setting);
    } catch {
      /* depolama kapalı */
    }
    if (setting !== 'system') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setting]);

  return [setting, setSetting] as const;
}
