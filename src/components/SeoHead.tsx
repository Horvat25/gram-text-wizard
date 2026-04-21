import { useEffect } from "react";
import { useSeoSettings } from "@/hooks/useSeoSettings";

/**
 * Injects Google Analytics 4 + Search Console verification into <head>.
 * Reads IDs from public seo_settings table (single row, public read).
 * Mount once in PortalLayout.
 */
export const SeoHead = () => {
  const { settings } = useSeoSettings();

  useEffect(() => {
    if (!settings) return;

    // ===== Google Analytics 4 =====
    const ga4Id = settings.ga4_measurement_id?.trim();
    if (ga4Id && /^G-[A-Z0-9]+$/i.test(ga4Id)) {
      if (!document.getElementById("ga4-loader")) {
        const s1 = document.createElement("script");
        s1.id = "ga4-loader";
        s1.async = true;
        s1.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
        document.head.appendChild(s1);

        const s2 = document.createElement("script");
        s2.id = "ga4-init";
        s2.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${ga4Id}', { anonymize_ip: true });
        `;
        document.head.appendChild(s2);
      }
    }

    // ===== Google Search Console verification =====
    const gscCode = settings.gsc_verification_code?.trim();
    if (gscCode) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="google-site-verification"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "google-site-verification";
        document.head.appendChild(meta);
      }
      meta.content = gscCode;
    }
  }, [settings]);

  return null;
};
