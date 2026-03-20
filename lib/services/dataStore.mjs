export class DataStore {
  constructor(rootURI) {
    this.rootURI = rootURI;
    this.cache = new Map();
  }

  async init() {
    await Promise.all([
      this.loadJSON('data/auto-us.json').catch(() => null),
      this.loadJSON('data/juris-us-map.json').catch(() => null),
      this.loadJSON('data/primary-jurisdictions.json').catch(() => null),
      this.loadJSON('data/primary-us.json').catch(() => null),
      this.loadJSON('data/secondary-us-bluebook.json').catch(() => null),
      this.loadJSON('style-modules/index.json').catch(() => null),
    ]);
  }


async loadText(relPath) {
  if (this.cache.has(relPath)) return this.cache.get(relPath);

  const url = this.rootURI.spec + relPath;

  let text;
  if (/^https?:\/\//i.test(url)) {
    // Recommended path for remote URLs
    const req = await Zotero.HTTP.request("GET", url);
    text = req.response;
  } else {
    // Keep working for jar:/file:/resource: plugin URIs
    text = await Zotero.File.getContentsAsync(url);
  }

  this.cache.set(relPath, text);
  return text;
}


  async loadJSON(relPath) {
    if (this.cache.has(relPath)) return this.cache.get(relPath);
    const text = await this.loadText(relPath);
    const obj = JSON.parse(text);
    this.cache.set(relPath, obj);
    return obj;
  }
}
