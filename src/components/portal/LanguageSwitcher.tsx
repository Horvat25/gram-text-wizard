import { useEffect, useState } from "react";
import { Languages, Check } from "lucide-react";

const LANGS = [
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
] as const;

const COOKIE = "googtrans";

const setLangCookie = (lang: string) => {
  const value = lang === "pt" ? "" : `/pt/${lang}`;
  // Set on multiple scopes for Google Translate widget
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toUTCString();
  document.cookie = `${COOKIE}=${value}; expires=${expires}; path=/`;
  const host = window.location.hostname.replace(/^www\./, "");
  document.cookie = `${COOKIE}=${value}; expires=${expires}; path=/; domain=.${host}`;
};

const readLangCookie = (): string => {
  const m = document.cookie.match(/googtrans=\/pt\/([a-z]{2})/);
  return m?.[1] || "pt";
};

export const LanguageSwitcher = () => {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>("pt");

  useEffect(() => {
    setCurrent(readLangCookie());

    // Inject Google Translate widget once
    if (document.getElementById("google-translate-script")) return;
    (window as unknown as { googleTranslateElementInit: () => void }).googleTranslateElementInit =
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const G = (window as any).google;
        if (G?.translate) {
          new G.translate.TranslateElement(
            {
              pageLanguage: "pt",
              includedLanguages: "en,es,fr,de,it,ja,zh-CN",
              autoDisplay: false,
              layout: G.translate.TranslateElement.InlineLayout.SIMPLE,
            },
            "google_translate_hidden"
          );
        }
      };
    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);

    // Hide Google's default top bar / tooltip styling
    const style = document.createElement("style");
    style.textContent = `
      .goog-te-banner-frame, .skiptranslate { display: none !important; }
      body { top: 0 !important; }
      .goog-tooltip, .goog-tooltip:hover { display: none !important; }
      .goog-text-highlight { background: none !important; box-shadow: none !important; }
      #google_translate_hidden { display: none; }
    `;
    document.head.appendChild(style);
  }, []);

  const choose = (code: string) => {
    setLangCookie(code);
    setCurrent(code);
    setOpen(false);
    // Reload to apply translation cleanly
    window.location.reload();
  };

  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  return (
    <>
      <div id="google_translate_hidden" aria-hidden />
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Mudar idioma"
          aria-expanded={open}
        >
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline">{active.flag}</span>
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl z-40 overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-3 pt-2.5 pb-1.5 border-b border-border/40">
                Idioma
              </p>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => choose(l.code)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/60 transition-colors"
                  translate="no"
                >
                  <span className="flex items-center gap-2">
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </span>
                  {current === l.code && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};
