/**
 * shopify.js - Rashmi Rao Designs / Rhytara
 * --------------------------------------------------------------------------
 * Thin client for the Shopify Storefront API (GraphQL). Turns Shopify
 * products into the exact shape the existing pages already consume, so the
 * page code barely changes:
 *
 *   { id, handle, title, category, medium, priceInr, compareAtInr, sold,
 *     badge, edition, description, descriptionHtml, note, quote,
 *     specs{}, mediumSpecs{}, year, tags[], options[], variants[], images[] }
 *
 * Exposes window.Store. Every method is a no-op-friendly Promise: when the
 * store is not configured, getProducts() resolves to [] and getProduct()
 * to null, and callers fall back to their built-in copy.
 * --------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var CFG = window.SHOPIFY_CONFIG || {};
  var API_VERSION = CFG.apiVersion || '2025-04';

  function isConfigured() {
    return !!(CFG.domain && CFG.storefrontToken);
  }

  var endpoint = isConfigured()
    ? 'https://' + CFG.domain + '/api/' + API_VERSION + '/graphql.json'
    : null;

  /* -- Low-level GraphQL POST ------------------------------------------- */
  function query(gql, variables) {
    if (!isConfigured()) {
      return Promise.reject(new Error('Shopify store not configured'));
    }
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Shopify-Storefront-Access-Token': CFG.storefrontToken
      },
      body: JSON.stringify({ query: gql, variables: variables || {} })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Storefront API HTTP ' + r.status);
        return r.json();
      })
      .then(function (payload) {
        if (payload.errors && payload.errors.length) {
          throw new Error('Storefront API: ' + payload.errors[0].message);
        }
        return payload.data;
      });
  }

  /* -- GraphQL fragments ---------------------------------------------------
     One fragment for cards (grids) and one full one for the product page. */
  var CARD_METAFIELD_IDS = [
    '{ namespace: "custom", key: "medium" }',
    '{ namespace: "custom", key: "edition" }',
    '{ namespace: "custom", key: "badge" }'
  ].join(', ');

  var CARD_FIELDS = [
    'id',
    'handle',
    'title',
    'productType',
    'tags',
    'description',
    'availableForSale',
    'featuredImage { url altText }',
    'priceRange { minVariantPrice { amount currencyCode } }',
    'compareAtPriceRange { minVariantPrice { amount currencyCode } }',
    'variants(first: 1) { nodes { id availableForSale } }',
    'metafields(identifiers: [' + CARD_METAFIELD_IDS + ']) { key value }'
  ].join(' ');

  var METAFIELD_IDS = [
    '{ namespace: "custom", key: "medium" }',
    '{ namespace: "custom", key: "edition" }',
    '{ namespace: "custom", key: "badge" }',
    '{ namespace: "custom", key: "artist_quote" }',
    '{ namespace: "custom", key: "specifications" }',
    '{ namespace: "custom", key: "medium_care" }',
    '{ namespace: "custom", key: "note" }'
  ].join(', ');

  var FULL_FIELDS = [
    'id',
    'handle',
    'title',
    'productType',
    'tags',
    'description',
    'descriptionHtml',
    'availableForSale',
    'priceRange { minVariantPrice { amount currencyCode } }',
    'compareAtPriceRange { minVariantPrice { amount currencyCode } }',
    'options { name values }',
    'images(first: 20) { nodes { url altText } }',
    'variants(first: 30) { nodes { id title availableForSale ' +
      'price { amount currencyCode } compareAtPrice { amount currencyCode } ' +
      'selectedOptions { name value } image { url altText } } }',
    'metafields(identifiers: [' + METAFIELD_IDS + ']) { key value }'
  ].join(' ');

  /* -- Helpers ----------------------------------------------------------- */
  function money(node) {
    if (!node || node.amount == null) return null;
    if (node.currencyCode && node.currencyCode !== 'USD') {
      console.warn('[Store] Store currency is ' + node.currencyCode +
        ', not USD - prices on the site assume USD. Set the store currency to USD.');
    }
    return Math.round(parseFloat(node.amount) * (node.currencyCode === 'USD' ? 84 : 1));
  }

  function metafieldMap(nodes) {
    var out = {};
    (nodes || []).forEach(function (m) {
      if (m && m.key) out[m.key] = m.value;
    });
    return out;
  }

  /* "Label: value" per line -> ordered object */
  function parseSpecBlock(text) {
    var out = {};
    if (!text) return out;
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var i = line.indexOf(':');
      if (i === -1) { out[line] = ''; return; }
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  function yearFromTags(tags) {
    var y = '';
    (tags || []).forEach(function (t) {
      var m = /^year\s+(\d{4})$/i.exec(t) || /^(\d{4})$/.exec(t);
      if (m) y = m[1];
    });
    return y;
  }

  function stripTags(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || d.innerText || '').trim();
  }

  /* descriptionHtml -> "\n\n"-delimited plain paragraphs, dropping a leading
     <p><em>medium</em></p> line if it just repeats the medium metafield. */
  function paragraphs(descriptionHtml, description, medium) {
    var chunks = [];
    if (descriptionHtml) {
      chunks = descriptionHtml.split(/<\/p>/i).map(stripTags).filter(Boolean);
    } else if (description) {
      chunks = description.split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (chunks.length > 1 && medium &&
        chunks[0].replace(/\s+/g, ' ') === String(medium).replace(/\s+/g, ' ')) {
      chunks = chunks.slice(1);
    }
    return chunks.join('\n\n');
  }

  function imageObjects(nodes, title) {
    var imgs = (nodes || []).map(function (n) {
      return {
        src: n.url, thumb: n.url, fallback: n.url, thumbFallback: n.url,
        alt: n.altText || title
      };
    });
    return imgs;
  }

  /* -- Normalisers ----------------------------------------------------- */
  function normaliseCard(p) {
    if (!p) return null;
    var tags = p.tags || [];
    var mf = metafieldMap(p.metafields);
    var limited = tags.some(function (t) { return /limited edition/i.test(t); });
    var category = p.productType || (tags[0] || '');
    if (limited && !/limited edition/i.test(category)) {
      category = category ? category + ' · Limited Edition' : 'Limited Edition';
    }
    var firstVariant = p.variants && p.variants.nodes && p.variants.nodes[0];
    var priceInr = money(p.priceRange && p.priceRange.minVariantPrice);
    var compareAtInr = money(p.compareAtPriceRange && p.compareAtPriceRange.minVariantPrice);
    var img = p.featuredImage || null;
    var blurb = (p.description || '').replace(/\s+/g, ' ').trim();
    if (blurb.length > 180) blurb = blurb.slice(0, 177).replace(/\s+\S*$/, '') + '…';
    return {
      id: p.id,
      handle: p.handle,
      title: p.title,
      category: category,
      type: p.productType || '',
      medium: mf.medium || p.productType || '',
      badge: mf.badge || '',
      edition: mf.edition || '',
      blurb: blurb,
      priceInr: priceInr,
      compareAtInr: compareAtInr && compareAtInr > priceInr ? compareAtInr : null,
      sold: p.availableForSale === false,
      year: yearFromTags(tags),
      tags: tags,
      firstVariantId: firstVariant ? firstVariant.id : null,
      image: img ? { src: img.url, alt: img.altText || p.title } : null,
      images: img ? [{ src: img.url, thumb: img.url, fallback: img.url, thumbFallback: img.url, alt: img.altText || p.title }] : []
    };
  }

  function normaliseFull(p) {
    if (!p) return null;
    var tags = p.tags || [];
    var mf = metafieldMap(p.metafields);
    var limited = tags.some(function (t) { return /limited edition/i.test(t); });
    var category = p.productType || '';
    if (limited) category = category ? category + ' · Limited Edition' : 'Limited Edition';

    var variants = (p.variants && p.variants.nodes ? p.variants.nodes : []).map(function (v) {
      return {
        id: v.id,
        title: v.title,
        availableForSale: v.availableForSale,
        quantityAvailable: v.quantityAvailable,
        priceInr: money(v.price),
        compareAtInr: money(v.compareAtPrice),
        selectedOptions: v.selectedOptions || [],
        image: v.image ? { src: v.image.url, alt: v.image.altText || p.title } : null
      };
    });

    // Real options only: drop Shopify's implicit single "Title" option.
    var options = (p.options || []).filter(function (o) {
      return !(o.values && o.values.length === 1 &&
        /^(title|default title)$/i.test(o.values[0]));
    });

    var priceInr = money(p.priceRange && p.priceRange.minVariantPrice);
    var compareAtInr = money(p.compareAtPriceRange && p.compareAtPriceRange.minVariantPrice);

    return {
      id: p.id,
      handle: p.handle,
      title: p.title,
      category: category || (mf.medium || ''),
      type: p.productType || '',
      medium: mf.medium || p.productType || '',
      priceInr: priceInr,
      compareAtInr: compareAtInr && compareAtInr > priceInr ? compareAtInr : null,
      sold: p.availableForSale === false,
      badge: mf.badge || '',
      edition: mf.edition || '',
      quote: mf.artist_quote || '',
      note: mf.note || '',
      description: paragraphs(p.descriptionHtml, p.description, mf.medium),
      descriptionHtml: p.descriptionHtml || '',
      specs: parseSpecBlock(mf.specifications),
      mediumSpecs: parseSpecBlock(mf.medium_care),
      year: yearFromTags(tags),
      tags: tags,
      options: options,
      variants: variants,
      images: imageObjects(p.images && p.images.nodes, p.title)
    };
  }

  /* -- Public API ----------------------------------------------------- */

  /**
   * getProducts({ first, collection }) -> Promise<Array<card>>
   * `collection` is a collection handle; omit it to read every product.
   */
  function getProducts(opts) {
    opts = opts || {};
    var first = opts.first || 50;
    if (!isConfigured()) return Promise.resolve([]);

    if (opts.collection) {
      var q = 'query($handle:String!,$first:Int!){ collection(handle:$handle){ ' +
        'products(first:$first){ nodes { ' + CARD_FIELDS + ' } } } }';
      return query(q, { handle: opts.collection, first: first })
        .then(function (d) {
          var nodes = d && d.collection && d.collection.products
            ? d.collection.products.nodes : [];
          return nodes.map(normaliseCard);
        })
        .catch(function (e) { console.warn('[Store] getProducts', e); return []; });
    }
    var qa = 'query($first:Int!){ products(first:$first){ nodes { ' + CARD_FIELDS + ' } } }';
    return query(qa, { first: first })
      .then(function (d) {
        return (d && d.products ? d.products.nodes : []).map(normaliseCard);
      })
      .catch(function (e) { console.warn('[Store] getProducts', e); return []; });
  }

  /** getProduct(handle) -> Promise<full | null> */
  function getProduct(handle) {
    if (!isConfigured() || !handle) return Promise.resolve(null);
    var q = 'query($handle:String!){ product(handle:$handle){ ' + FULL_FIELDS + ' } }';
    return query(q, { handle: handle })
      .then(function (d) { return normaliseFull(d && d.product); })
      .catch(function (e) { console.warn('[Store] getProduct', e); return null; });
  }

  /** getRecommendations(productGid) -> Promise<Array<card>> */
  function getRecommendations(productId) {
    if (!isConfigured() || !productId) return Promise.resolve([]);
    var q = 'query($id:ID!){ productRecommendations(productId:$id){ ' + CARD_FIELDS + ' } }';
    return query(q, { id: productId })
      .then(function (d) {
        return (d && d.productRecommendations ? d.productRecommendations : []).map(normaliseCard);
      })
      .catch(function (e) { console.warn('[Store] getRecommendations', e); return []; });
  }

  window.Store = {
    isConfigured: isConfigured,
    query: query,
    getProducts: getProducts,
    getProduct: getProduct,
    getRecommendations: getRecommendations,
    _normaliseCard: normaliseCard,
    _normaliseFull: normaliseFull
  };
}());
