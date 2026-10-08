/**
 * Dark / Light theme toggle for the Stitch frontend.
 *
 * The palette itself lives in CSS custom properties (stitch.css):
 *   :root                 → the original dark cockpit (values unchanged)
 *   [data-theme="light"]  → the designed light palette
 * The Tailwind config maps every semantic color to these variables, so a
 * single data-theme flip on <html> re-skins the whole app — including all
 * Tailwind opacity utilities — instantly and without a reload.
 *
 * The choice persists in localStorage under "intellitraffic-theme" and is
 * restored by an inline head script before first paint (no flash).
 */

export const THEME_STORAGE_KEY = 'intellitraffic-theme';

const TOGGLE_IDS = ['theme-toggle', 'theme-toggle-desktop'];

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Icon shows the mode the user will switch TO (sun in dark mode).
  document.querySelectorAll('[data-theme-icon]').forEach((icon) => {
    icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  });

  document.querySelectorAll('.theme-toggle').forEach((button) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-pressed', String(theme === 'light'));
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.title = `Switch to ${next} theme`;
  });
}

export function initThemeToggle() {
  // Sync icons/labels with whatever the head script restored (default: dark).
  applyTheme(currentTheme());

  TOGGLE_IDS.forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';

      // Subtle cross-fade — the helper class is removed right after the
      // switch so regular interactions and initial loads never animate.
      document.documentElement.classList.add('theme-anim');
      applyTheme(next);
      window.setTimeout(() => {
        document.documentElement.classList.remove('theme-anim');
      }, 320);

      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch (_) {
        // Storage unavailable (private mode etc.) — theme still applies
        // for this session; persistence resumes when storage works.
      }
    });
  });
}

/** Exposed for completeness — other modules can read the active theme. */
export function getActiveTheme() {
  return currentTheme();
}
