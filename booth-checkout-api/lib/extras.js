/**
 * Booth add-ons (ExpoFP calls them extras).
 *
 * The catalogue lives here, on the server: the checkout page only ever sends
 * the ids someone ticked, never a price. Override it with BOOTH_EXTRAS, a JSON
 * array of { id, name, price, description, expofpExtraId, booths }.
 *
 * `booths` limits an add-on to certain booths - Power Plugs only fits the
 * tables against a wall. An empty or missing list means every booth.
 *
 * `expofpExtraId` is the numeric id from ExpoFP's list-extras, and is how a
 * paid add-on is assigned on the floor plan. Without it we fall back to
 * matching the extra by name; if the expo has no such extra, the add-on is
 * still charged and recorded in the exhibitor's admin notes, just not assigned.
 */
// The tables with wall space - the only ones Power Plugs can be run to.
// Override with POWER_PLUGS_BOOTHS (comma separated), or replace the whole
// catalogue with BOOTH_EXTRAS.
const POWER_PLUG_BOOTHS = ['2', '3', '4', '5', '30', '31', '32'];

/**
 * Read per call, not once at import: EXPOFP_EXTRA_ID_POWER_PLUGS is how the
 * expo's own extra is pointed at, and POWER_PLUGS_BOOTHS which booths it fits.
 */
function defaultExtras() {
  const expofpExtraId = Number(process.env.EXPOFP_EXTRA_ID_POWER_PLUGS);
  const booths = parseBooths(process.env.POWER_PLUGS_BOOTHS) || POWER_PLUG_BOOTHS;
  return [
    {
      id: 'power-plugs',
      name: 'Power Plugs',
      price: 25,
      description: 'A powered outlet at your table. Available for wall tables only.',
      booths,
      ...(Number.isInteger(expofpExtraId) && expofpExtraId > 0 ? { expofpExtraId } : {}),
    },
  ];
}

/** "5, 4, 3" or ["5","4"] -> ['5','4','3']; nothing usable -> null. */
function parseBooths(value) {
  const list = (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((name) => clean(name, 40))
    .filter(Boolean);
  return list.length ? list : null;
}

const sameBooth = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * True when this add-on can be sold for that booth. An add-on with no booth
 * list fits every booth; one with a list fits only those.
 */
export function extraFitsBooth(extra, boothName) {
  if (!extra.booths?.length) return true;
  if (!String(boothName ?? '').trim()) return false;
  return extra.booths.some((name) => sameBooth(name, boothName));
}

/** The add-ons that can be sold for one booth. */
export function extrasForBooth(boothName) {
  return extrasCatalogue().filter((extra) => extraFitsBooth(extra, boothName));
}

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
      ...(parseBooths(extra?.booths) ? { booths: parseBooths(extra.booths) } : {}),
      ...(Number.isInteger(Number(extra?.expofpExtraId)) && Number(extra?.expofpExtraId) > 0
        ? { expofpExtraId: Number(extra.expofpExtraId) }
        : {}),
    }))
    .filter((extra) => extra.id && extra.name && Number.isFinite(extra.price) && extra.price >= 0);
}

export function extrasCatalogue() {
  const raw = (process.env.BOOTH_EXTRAS || '').trim();
  if (!raw) return defaultExtras();

  try {
    const list = parseCatalogue(raw);
    if (list.length) return list;
    console.error('[extras] BOOTH_EXTRAS held no usable entries - using the built-in catalogue');
  } catch (error) {
    console.error('[extras] BOOTH_EXTRAS is not valid JSON - using the built-in catalogue:', error.message);
  }
  return defaultExtras();
}

/**
 * Turns the ids the visitor ticked into priced items. Anything the catalogue
 * does not list - or does not offer for this booth - is dropped rather than
 * charged, and duplicates count once. The booth decides, not the page: a
 * request that asks for Power Plugs on a booth without wall space gets a booth
 * and no add-on.
 */
export function priceSelectedExtras(ids, boothName) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))];
  const catalogue = extrasForBooth(boothName);

  const items = catalogue.filter((extra) => wanted.includes(extra.id));
  const unknown = wanted.filter((id) => !items.some((extra) => extra.id === id));
  const total = items.reduce((sum, extra) => sum + extra.price, 0);

  return { items, total, unknown };
}
