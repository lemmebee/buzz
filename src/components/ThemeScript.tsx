export function ThemeScript() {
  const script = `
    (function() {
      try {
        const theme = localStorage.getItem('theme') || 'system';
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
        document.documentElement.classList.add(isDark ? 'dark' : 'light');
      } catch (e) {
        document.documentElement.classList.add('light');
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
