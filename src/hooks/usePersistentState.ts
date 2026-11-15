import { useEffect, useState } from 'react';

export const STORAGE_ERROR_EVENT = 'tn-storage-error';

/** localStorage ile senkron tutulan state. Sayfa yenilense bile veriler korunur. */
export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT));
    }
  }, [key, state]);

  return [state, setState] as const;
}
