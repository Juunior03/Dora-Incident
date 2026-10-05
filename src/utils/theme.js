// Thème de l'application : clair, sombre ou système (suit le réglage de l'ordinateur).
// Choix mémorisé sur le poste ; la classe « dark » est posée sur <html> (Tailwind, darkMode « class »).
import { useEffect, useState } from 'react';

const CLE = 'dora-theme';
export const THEMES = ['clair', 'sombre', 'systeme'];
const EVENEMENT = 'dora-theme';

export function lireTheme() {
  try {
    const v = globalThis.localStorage?.getItem(CLE);
    return THEMES.includes(v) ? v : 'systeme';
  } catch {
    return 'systeme';
  }
}

const systemeSombre = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function appliquerTheme(choix = lireTheme()) {
  const sombre = choix === 'sombre' || (choix === 'systeme' && systemeSombre());
  document.documentElement.classList.toggle('dark', sombre);
  document.documentElement.style.colorScheme = sombre ? 'dark' : 'light';
}

/** À appeler une fois au démarrage : applique le thème et suit les changements du réglage système */
export function initialiserTheme() {
  appliquerTheme();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (lireTheme() === 'systeme') appliquerTheme('systeme');
  });
}

export function useTheme() {
  const [theme, setTheme] = useState(lireTheme);
  useEffect(() => {
    const maj = () => setTheme(lireTheme());
    globalThis.addEventListener(EVENEMENT, maj);
    return () => globalThis.removeEventListener(EVENEMENT, maj);
  }, []);
  const changer = (choix) => {
    try { globalThis.localStorage?.setItem(CLE, choix); } catch { /* stockage indisponible */ }
    appliquerTheme(choix);
    setTheme(choix);
    globalThis.dispatchEvent(new Event(EVENEMENT));
  };
  return [theme, changer];
}
