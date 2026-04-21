import { ReactNode, useEffect } from "react";
import { PortalHeader } from "./PortalHeader";
import { PortalFooter } from "./PortalFooter";

interface SEO {
  title?: string;
  description?: string;
  image?: string;
  type?: "website" | "article";
  canonicalPath?: string;
  jsonLd?: Record<string, unknown>;
}

interface PortalLayoutProps {
  children: ReactNode;
  seo?: SEO;
}

const setMeta = (selector: string, attr: string, value: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [k, v] = selector.replace(/[\[\]"']/g, "").split("=");
    el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
};

export const PortalLayout = ({ children, seo }: PortalLayoutProps) => {
  useEffect(() => {
    const title = seo?.title ? `${seo.title} | Neural Update` : "Neural Update — Notícias de tecnologia e IA";
    document.title = title;

    const desc =
      seo?.description ??
      "Portal Neural Update: notícias de tecnologia, inteligência artificial, gadgets e futuro, atualizadas em tempo real.";

    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:type"]', "content", seo?.type ?? "website");
    if (seo?.image) {
      setMeta('meta[property="og:image"]', "content", seo.image);
      setMeta('meta[name="twitter:image"]', "content", seo.image);
    }
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", desc);

    // Canonical
    const canonicalHref = `${window.location.origin}${seo?.canonicalPath ?? window.location.pathname}`;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonicalHref);

    // JSON-LD
    const existing = document.head.querySelector('script[data-portal-ld="1"]');
    if (existing) existing.remove();
    if (seo?.jsonLd) {
      const script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      script.setAttribute("data-portal-ld", "1");
      script.text = JSON.stringify(seo.jsonLd);
      document.head.appendChild(script);
    }
  }, [seo]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <PortalHeader />
      <main className="flex-1">{children}</main>
      <PortalFooter />
    </div>
  );
};
