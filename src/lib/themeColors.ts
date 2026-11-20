/**
 * Telefonun üst durum çubuğu (status bar) ve PWA çerçevesi için renkler: uygulamanın ana zemini
 * (src/index.css --c-surface) ile aynı, böylece çubuklar sayfanın bir parçası gibi görünür (sarı değil).
 * index.html'deki satır içi tema betiği ve public/manifest.json bu değerlerle uyumlu tutulur (themeColors.test.ts).
 */
export const SURFACE_COLOR = { light: '#FFFFFF', dark: '#1E1E1E' } as const;

/** Etkin temaya göre <meta name="theme-color"> değeri */
export const themeColorFor = (dark: boolean) => (dark ? SURFACE_COLOR.dark : SURFACE_COLOR.light);
