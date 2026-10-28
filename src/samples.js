/**
 * Sample documents for the Sample button and the ?demo screenshot state.
 * They show off what the tool handles: Unicode and escapes, a 20-digit id that must not be
 * rounded, exponents, nesting, empty containers, booleans and null.
 * In these template literals `\\` stands for one backslash of the JSON text.
 */

const PROJECT = `{
  "name": "json-formatter",
  "version": "1.0.0",
  "id": 12345678901234567890,
  "license": "MIT",
  "private": false,
  "rating": 4.95,
  "maintainers": [
    { "name": "Deniz Kaya", "role": "author", "active": true },
    { "name": "Sam Rivera", "role": "reviewer", "active": false }
  ],
  "features": ["format", "minify", "sort keys", "tree", "diff", "query"],
  "settings": {
    "indent": 2,
    "relaxed": true,
    "theme": { "background": "#0f172a", "accent": "#fcd34d" }
  },
  "greeting": "Merhaba dünya \\ud83d\\udc4b",
  "speedOfLight": 2.99792458e8,
  "tags": [],
  "homepage": null
}
`;

const ORDERS = `{
  "page": 1,
  "total": 2,
  "orders": [
    {
      "id": "A-1001",
      "customer": { "name": "Elif Şahin", "city": "İzmir" },
      "items": [
        { "sku": "TEA-01", "qty": 2, "price": 4.5 },
        { "sku": "MUG-07", "qty": 1, "price": 12.0 }
      ],
      "paid": true,
      "note": "Leave at the door \\u2014 thanks!"
    },
    {
      "id": "A-1002",
      "customer": { "name": "Jonas Berg", "city": "Malmö" },
      "items": [{ "sku": "PEN-33", "qty": 10, "price": 1.25 }],
      "paid": false,
      "note": null
    }
  ]
}
`;

const PLACES = `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Galata Tower", "height_m": 62.59, "opened": 1348 },
      "geometry": { "type": "Point", "coordinates": [28.9741, 41.0256] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Bosphorus Bridge", "length_m": 1560, "lanes": [3, 3] },
      "geometry": {
        "type": "LineString",
        "coordinates": [[29.0034, 41.0451], [29.0377, 41.0479]]
      }
    }
  ]
}
`;

/** Documents the Sample button cycles through. */
export const SAMPLES = Object.freeze([PROJECT, ORDERS, PLACES]);

/**
 * The ?demo state: the project document (shown in the tree) and the same text with one comma
 * removed after `"license": "MIT"`, so the input shows exactly one syntax error; `compare` is a
 * later version of the project for the Diff tab.
 */
export const DEMO = Object.freeze({
  document: PROJECT,
  broken: PROJECT.replace('"license": "MIT",', '"license": "MIT"'),
  compare: PROJECT.replace('"version": "1.0.0"', '"version": "1.1.0"')
    .replace('"rating": 4.95', '"rating": 4.97')
    .replace(', "query"]', ', "query", "repair"]')
    .replace('    "relaxed": true,\n', '')
    .replace('"tags": []', '"tags": ["json", "formatter"]'),
});
