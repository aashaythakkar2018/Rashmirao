/**
 * shopify-config.js - Rashmi Rao Designs / Rhytara
 * --------------------------------------------------------------------------
 * Connection settings for the headless Shopify storefront.
 *
 * Fill these two values in once the Shopify store exists (see SHOPIFY-SETUP.md):
 *
 *   domain           your permanent *.myshopify.com domain, e.g. rhytara.myshopify.com
 *                    (NOT the custom domain - the API only answers on the myshopify one)
 *   storefrontToken  the "Storefront API access token" from a custom app in
 *                    Shopify admin (Settings -> Apps and sales channels ->
 *                    Develop apps). This token is PUBLIC by design - it is meant
 *                    to be read by browsers, so committing it here is fine.
 *
 * While these are blank the site runs in "offline" mode: every page falls back
 * to its built-in copy and the cart is disabled with a notice. Nothing breaks.
 * --------------------------------------------------------------------------
 */
window.SHOPIFY_CONFIG = {
  domain: 'bjmcta-mt.myshopify.com',
  storefrontToken: 'c5947dad2e4471e1630215968125eb42',
  apiVersion: '2025-04',

  /* Handles of the collections the site reads. Create these in
     Shopify admin -> Products -> Collections. `all` should contain every
     buyable work; `featured` drives the homepage grid. */
  collections: {
    all: 'all',
    featured: 'featured'
  }
};
