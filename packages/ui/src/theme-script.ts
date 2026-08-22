export const THEME_STORAGE_KEY = "reclaimr-theme";

/**
 * Inline script that applies the persisted theme before first paint. Apps
 * render it via <script dangerouslySetInnerHTML> in the document <head> so
 * there is no light/dark flash before React hydrates. Lives outside the
 * client-only theme module so server components can call it.
 */
export function themeInitScript(): string {
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
}
