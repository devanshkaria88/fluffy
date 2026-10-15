"use client";
import { useLayoutEffect } from "react";

const THEME_KEY = "fluffy-theme";
type Theme = "dark" | "light";

/** Applies a remembered choice before first paint so a light-mode user never sees a dark flash. Rendered in <head>
 *  by app/layout.tsx. Executable only in the server HTML; on the client it is text/plain so React does not warn
 *  about rendering a <script>, and suppressHydrationWarning covers the type difference. */
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: js }} />;
}

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null; // storage unavailable (private mode, blocked)
  }
}

/** Dark is the default; light is opt-in and remembered. The inline script in app/layout.tsx applies the stored
 *  value before first paint; the icon is picked by CSS from html[data-theme], so this needs no client state. */
export default function ThemeToggle() {
  // React Strict Mode's dev remount resets <html> to its JSX attributes, dropping what the inline script set.
  // Re-apply before paint. No-op in production.
  useLayoutEffect(() => {
    const t = storedTheme();
    if (t) document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const next: Theme = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* not remembered this session */
    }
  };

  return (
    <button className="btn ghost theme-toggle" onClick={toggle} aria-label="Toggle light or dark theme" title="Toggle theme">
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
