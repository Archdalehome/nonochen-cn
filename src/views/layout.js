import { html, safe } from '../lib/html.js';
import { header } from './chrome.js';
import { footer } from './footer.js';
import { cartDrawer } from './cart-drawer.js';

/**
 * Full document shell. Every route renders its own `body` fragment and hands it
 * to this function, which wraps it in the announcement bar, the header, the
 * footer and the cart drawer that the original Shopify theme repeats on every
 * page.
 */
export const layout = ({
  settings,
  groups,
  cart,
  categories = [],
  path = '',
  symbol = '£',
  title,
  description = '',
  canonical = '',
  image = '',
  body,
  bodyClass = '',
  jsonLd = null,
}) => {
  const siteName = settings.site_name || 'Chen Furniture';
  const fullTitle = title ? `${title} | ${siteName}` : siteName;
  const metaDescription = description || settings.brand_line || '';

  return html`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${fullTitle}</title>
    <meta name="description" content="${metaDescription}">
    ${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${siteName}">
    <meta property="og:title" content="${fullTitle}">
    <meta property="og:description" content="${metaDescription}">
    ${image ? html`<meta property="og:image" content="${image}">` : ''}
    <link rel="icon" href="/images/logo.svg" type="image/svg+xml">
    ${settings.typekit_url
      ? html`<link rel="preconnect" href="https://use.typekit.net" crossorigin>
          <link rel="stylesheet" href="${settings.typekit_url}">`
      : ''}
    <link rel="stylesheet" href="/css/bootstrap.min.css">
    <link rel="stylesheet" href="/css/site.css">
    ${jsonLd ? html`<script type="application/ld+json">${safe(JSON.stringify(jsonLd))}</script>` : ''}
  </head>
  <body class="d-flex flex-column min-vh-100 ${bodyClass}">
    ${header(settings, cart, categories, path)}
    <main class="flex-grow-1" id="main">${body}</main>
    ${footer(settings, groups)}
    ${cartDrawer(settings, cart, symbol)}
    <div class="toast-container position-fixed bottom-0 end-0 p-3" id="site-toasts"></div>
    <script src="/js/bootstrap.bundle.min.js" defer></script>
    <script src="/js/site.js" defer></script>
  </body>
</html>`;
};

/** Small helper for the 404 / error pages so they still look like the site. */
export const plainPage = ({ title, message, action }) => html`
  <div class="container py-5 my-5 text-center">
    <h1 class="heading-font text-uppercase fs-1 mb-3">${title}</h1>
    <p class="text-secondary mb-4">${message}</p>
    ${action
      ? html`<a href="${action.url}" class="btn btn-primary rounded px-4">${action.label}</a>`
      : ''}
  </div>`;
