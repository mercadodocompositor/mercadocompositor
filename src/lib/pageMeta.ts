/**
 * Título, descrição e Open Graph da página atual no navegador (aba, histórico,
 * favoritos e buscadores que executam JS). A prévia no WhatsApp/redes vem do
 * public/compositor.php, porque esses robôs não executam JavaScript.
 */

export interface PageMeta {
  title: string;
  description: string;
  url: string;
  image?: string;
}

const META_TARGETS: Array<{ selector: string; attr: 'content' | 'href'; value: (meta: PageMeta) => string | undefined }> = [
  { selector: 'meta[name="description"]', attr: 'content', value: m => m.description },
  { selector: 'link[rel="canonical"]', attr: 'href', value: m => m.url },
  { selector: 'meta[property="og:url"]', attr: 'content', value: m => m.url },
  { selector: 'meta[property="og:title"]', attr: 'content', value: m => m.title },
  { selector: 'meta[property="og:description"]', attr: 'content', value: m => m.description },
  { selector: 'meta[property="og:image"]', attr: 'content', value: m => m.image },
  { selector: 'meta[name="twitter:url"]', attr: 'content', value: m => m.url },
  { selector: 'meta[name="twitter:title"]', attr: 'content', value: m => m.title },
  { selector: 'meta[name="twitter:description"]', attr: 'content', value: m => m.description },
  { selector: 'meta[name="twitter:image"]', attr: 'content', value: m => m.image },
];

/** Aplica os metadados e devolve uma função que restaura os valores anteriores. */
export function applyPageMeta(meta: PageMeta): () => void {
  const previousTitle = document.title;
  const previous: Array<[Element, 'content' | 'href', string | null]> = [];

  document.title = meta.title;
  for (const target of META_TARGETS) {
    const value = target.value(meta);
    const element = document.head.querySelector(target.selector);
    if (!value || !element) continue;
    previous.push([element, target.attr, element.getAttribute(target.attr)]);
    element.setAttribute(target.attr, value);
  }

  return () => {
    document.title = previousTitle;
    for (const [element, attr, value] of previous) {
      if (value === null) element.removeAttribute(attr);
      else element.setAttribute(attr, value);
    }
  };
}

/** Resume um texto livre para meta description (~155 caracteres, sem cortar palavra). */
export function summarizeForMeta(text: string, maxLength = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?—-]+$/, '')}…`;
}

/** Só URLs absolutas http(s) servem de og:image; SVG não é aceito por WhatsApp/Facebook. */
export function isShareableImage(url?: string | null): url is string {
  return Boolean(url && /^https?:\/\//i.test(url) && !/\.svg(\?|#|$)/i.test(url));
}
