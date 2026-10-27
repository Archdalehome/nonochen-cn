import { html, safe } from '../lib/html.js';
import { icons } from './icons.js';

/* ---------------------------------------------------------------- columns ---- */

/** The links of one column, minus the rows an editor left without a URL. */
const columnLinks = (group) => (group.links || []).filter((link) => link.url);

/** A link to another site opens in a new tab; a path on this one does not. */
const target = (url) => (/^https?:\/\//i.test(url) ? safe(' target="_blank" rel="noopener"') : '');

/**
 * How wide one footer column is: the link columns split their row evenly, so the
 * width follows how many of them there are (four read as two across on a tablet
 * and four across on a desktop) and the row never wraps.
 */
const columnClass = (columns) =>
  columns >= 4 ? 'col-6 col-lg-3' : columns === 3 ? 'col-4' : columns === 2 ? 'col-6' : 'col-12';

export const footer = (settings, groups = []) => {
  const width = columnClass(groups.length);
  return html`
  <footer class="pt-3 pt-md-0 bg-footer mt-auto">
    <div class="container py-4 py-md-5">
      <div class="row g-0 px-1">
        <div class="col-12 col-md-6 d-flex flex-column justify-content-between">
          <div class="d-flex flex-column text-secondary">
            <div class="row mb-3 mb-md-4">
              <div class="col-12 col-md-8 fs-7">
                ${settings.footer_logo
                  ? html`<div class="footer-brand-row mb-3">
                      <img class="footer-logo" src="${settings.footer_logo}" alt="${settings.site_name || 'Chen Furniture'}" loading="lazy">
                      <span class="footer-brand heading-font">${settings.site_name || 'Chen Furniture'}</span>
                    </div>`
                  : html`<span class="footer-brand heading-font d-block mb-3">${settings.site_name || 'Chen Furniture'}</span>`}
                ${settings.brand_line}
              </div>
            </div>
            <div class="socials-container text-primary mb-4 mb-md-0 d-flex gap-3">
              ${settings.social_facebook
                ? html`<a href="${settings.social_facebook}" target="_blank" rel="noopener" class="text-decoration-none text-reset" aria-label="在 Facebook 关注我们">${icons.facebook}</a>`
                : ''}
              ${settings.social_instagram
                ? html`<a href="${settings.social_instagram}" target="_blank" rel="noopener" class="text-decoration-none text-reset" aria-label="在 Instagram 关注我们">${icons.instagram}</a>`
                : ''}
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="row d-none d-md-flex">
            ${groups.map(
              (group) => html`
                <div class="${width}">
                  <h5 class="lh-sm fw-medium mb-4">${group.label}</h5>
                  ${columnLinks(group).map(
                    (link) => html`<div class="mb-3">
                      <a class="fs-7 text-reset" href="${link.url}"${target(link.url)}>${link.label}</a>
                    </div>`
                  )}
                </div>`
            )}
          </div>

          <div class="accordion d-md-none" id="accordionFooter">
            ${groups.map(
              (group, index) => html`
                <div class="accordion-item bg-transparent border-0 px-0">
                  <h6 class="accordion-header mb-0" id="footer-heading-${index}">
                    <button class="accordion-button collapsed bg-transparent px-0 py-2 fs-7 fw-medium" type="button" data-bs-toggle="collapse" data-bs-target="#footer-collapse-${index}" aria-expanded="false" aria-controls="footer-collapse-${index}">
                      ${group.label}
                    </button>
                  </h6>
                  <div id="footer-collapse-${index}" class="accordion-collapse collapse" aria-labelledby="footer-heading-${index}" data-bs-parent="#accordionFooter">
                    <div class="accordion-body pt-0 px-3">
                      ${columnLinks(group).map(
                        (link) => html`<div class="mb-1">
                          <a class="fs-8 text-reset" href="${link.url}"${target(link.url)}>${link.label}</a>
                        </div>`
                      )}
                    </div>
                  </div>
                </div>`
            )}
          </div>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="row g-0">
        <div class="col-12 bg-footer">
          <p class="mb-0 text-center py-1 px-0 fs-7 d-flex justify-content-center justify-content-md-between flex-wrap flex-md-nowrap">
            <small>${settings.footer_copyright}</small>
            <small class="d-md-none mx-1">|</small>
            ${settings.footer_credit
              ? html`<small>${settings.footer_credit}${settings.footer_credit_url
                  ? html` <a href="${settings.footer_credit_url}" target="_blank" rel="noopener">${settings.footer_credit_url.replace(/^https?:\/\//, '')}</a>`
                  : ''}</small>`
              : ''}
          </p>
        </div>
      </div>
    </div>
  </footer>`;
};
