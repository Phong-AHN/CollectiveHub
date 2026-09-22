/**
 * Booth add-ons (ExpoFP calls them extras).
 *
 * The catalogue lives here, on the server: the checkout page only ever sends
 * the ids someone ticked, never a price. Override it with BOOTH_EXTRAS, a JSON
 * array of { id, name, price, description }.
 */
const DEFAULT_EXTRAS = [
  {
    id: 'power-plugs',
    name: 'Power Plugs',
    price: 20,
    description: 'A powered outlet at your table.',
  },
];

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function parseCatalogue(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('BOOTH_EXTRAS must be a JSON array');

  return parsed
    .map((extra) => ({
      id: clean(extra?.id, 60),
      name: clean(extra?.name, 120),
      price: Number(extra?.price),
      description: clean(extra?.description, 200),
    }))
    .filter((extra) => extra.id && extra.name && Number.isFinite(extra.price) && extra.price >= 0);
}

export function extrasCatalogue() {
  const raw = (process.env.BOOTH_EXTRAS || '').trim();
  if (!raw) return DEFAULT_EXTRAS;

  try {
    const list = parseCatalogue(raw);
    if (list.length) return list;
    console.error('[extras] BOOTH_EXTRAS held no usable entries - using the built-in catalogue');
  } catch (error) {
    console.error('[extras] BOOTH_EXTRAS is not valid JSON - using the built-in catalogue:', error.message);
  }
  return DEFAULT_EXTRAS;
}

/**
 * Turns the ids the visitor ticked into priced items. Anything the catalogue
 * does not list is dropped rather than charged, and duplicates count once.
 */
export function priceSelectedExtras(ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))];
  const catalogue = extrasCatalogue();

  const items = catalogue.filter((extra) => wanted.includes(extra.id));
  const unknown = wanted.filter((id) => !items.some((extra) => extra.id === id));
  const total = items.reduce((sum, extra) => sum + extra.price, 0);

  return { items, total, unknown };
}
