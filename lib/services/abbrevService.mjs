export class AbbrevService {
  constructor({ dataStore }) {
    this.dataStore = dataStore;
    this._autoUS = null;
    this._primaryUS = null;
    this._secondaryUS = null;
    this._primaryJur = null;
  }

  async preload() {
    this._autoUS = await this.dataStore.loadJSON('data/auto-us.json');
    this._primaryUS = await this.dataStore.loadJSON('data/primary-us.json');
    this._secondaryUS = await this.dataStore.loadJSON('data/secondary-us-bluebook.json');
    this._primaryJur = await this.dataStore.loadJSON('data/primary-jurisdictions.json');
  }

  normalizeKey(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .replace(/[^a-z0-9\s\.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  parseDirective(val) {
    if (!val) return { value: val, directive: null };
    const m = /^!([a-z-]+)\>\>\>(.+)$/.exec(val);
    if (!m) return { value: val, directive: null };
    return { value: m[2], directive: m[1] };
  }

  lookupSync(listname, key, jur) {
    const j = (jur || 'us').toLowerCase();
    const kNorm = this.normalizeKey(key);

    if (listname === 'institution-part') {
      return lookupJurChain(this._autoUS?.xdata, j, 'institution-part', key)
        || lookupJurChain(this._autoUS?.xdata, j, 'institution-part', kNorm);
    }

    if (listname === 'place') {
      const upper = j.toUpperCase();
      return this._primaryJur?.xdata?.default?.place?.[upper]
        || this._autoUS?.xdata?.default?.place?.[upper]
        || null;
    }

    if (listname === 'container-title') {
      return lookupJurChain(this._primaryUS?.xdata, j, 'container-title', kNorm)
        || this._secondaryUS?.xdata?.default?.['container-title']?.[kNorm]
        || null;
    }

    return null;
  }
}

function lookupJurChain(xdata, jur, variable, key) {
  if (!xdata) return null;
  const parts = (jur || 'us').toLowerCase().split(':');
  for (let i = parts.length; i >= 1; i--) {
    const jj = parts.slice(0, i).join(':');
    const obj = xdata?.[jj]?.[variable];
    if (obj && obj[key] != null) return obj[key];
  }
  const obj = xdata?.['us']?.[variable];
  if (obj && obj[key] != null) return obj[key];
  return null;
}
