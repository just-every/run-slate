import { html } from './html';
import { publicDocumentStyles } from './document-styles';

export const publicDocumentHeaders = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export const publicBrand = '<a class="public-brand" href="/" aria-label="Slate home"><img src="/slate-mark.svg" width="34" height="34" alt="">Slate</a>';

export function publicDocumentShell({ title, theme, indexable = false, metadata = '', header, content, fullWidth = false }: {
  title: string; theme?: string; indexable?: boolean; metadata?: string; header: string; content: string; fullWidth?: boolean;
}) {
  return `<!doctype html><html lang="en" data-theme="${theme === 'dark' ? 'dark' : 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${indexable ? 'index,follow' : 'noindex,nofollow'}"><title>${html(title)} · Slate</title><link rel="icon" href="/favicon.svg">${metadata}<style>${publicDocumentStyles}</style></head><body>${header}<main class="public-main" data-full-width="${fullWidth}">${content}</main><footer class="public-footer">Published with Slate</footer></body></html>`;
}

export function renderUnavailablePublicDocument() {
  return publicDocumentShell({
    title: 'Page unavailable',
    header: `<header class="public-header"><div class="public-header-inner">${publicBrand}</div></header>`,
    content: '<section class="public-unavailable"><h1 class="page-title">This link is no longer available.</h1><p>The page may be private or its public access may have stopped. Ask the person who shared it for a current link.</p><a class="public-action" href="/signin">Sign in to Slate</a></section>',
  });
}
