var IndigoBookCSLM = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/main.mjs
  var main_exports = {};
  __export(main_exports, {
    activate: () => activate,
    deactivate: () => deactivate
  });

  // lib/services/dataStore.mjs
  var DataStore = class {
    constructor(rootURI) {
      this.rootURI = rootURI;
      this.cache = /* @__PURE__ */ new Map();
    }
    async init() {
      await Promise.all([
        this.loadJSON("data/auto-us.json").catch(() => null),
        this.loadJSON("data/juris-us-map.json").catch(() => null),
        this.loadJSON("data/primary-jurisdictions.json").catch(() => null),
        this.loadJSON("data/primary-us.json").catch(() => null),
        this.loadJSON("data/secondary-us-bluebook.json").catch(() => null),
        this.loadJSON("style-modules/index.json").catch(() => null)
      ]);
    }
    async loadText(relPath) {
      if (this.cache.has(relPath)) return this.cache.get(relPath);
      const url = this.rootURI.spec + relPath;
      let text;
      if (/^https?:\/\//i.test(url)) {
        const req = await Zotero.HTTP.request("GET", url);
        text = req.response;
      } else {
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
  };

  // lib/services/jurisdiction.mjs
  var Jurisdiction = class {
    static fromItem(item) {
      const extra = (item.getField?.("extra") || item.extra || "") + "";
      let jur = this._fromMLZ(extra) || this._fromKeyValue(extra);
      if (!jur) jur = "us";
      return (jur + "").trim().toLowerCase();
    }
    static _fromMLZ(extra) {
      const idx = extra.indexOf("mlzsync1:");
      if (idx === -1) return null;
      const brace = extra.indexOf("{", idx);
      if (brace === -1) return null;
      try {
        const obj = JSON.parse(extra.slice(brace).trim());
        const j = obj?.extrafields?.jurisdiction;
        if (!j) return null;
        return this._decodeLengthPrefixedJurisdiction(j);
      } catch (e) {
        return null;
      }
    }
    static _decodeLengthPrefixedJurisdiction(s) {
      if (!s || s.length < 4) return null;
      const prefix = s.slice(0, 3);
      if (!/^\d{3}$/.test(prefix)) return s;
      const len = parseInt(prefix, 10);
      const code = s.slice(3, 3 + len);
      return code || null;
    }
    static _fromKeyValue(extra) {
      const m = extra.match(/^\s*jurisdiction\s*:\s*([^\s\n\r]+)\s*$/im);
      return m ? m[1] : null;
    }
    static trimChain(jur) {
      const parts = (jur || "us").toLowerCase().split(":");
      const chain = [];
      for (let i = parts.length; i >= 1; i--) chain.push(parts.slice(0, i).join(":"));
      return chain;
    }
    static isCircuit(jur) {
      const parts = (jur || "").toLowerCase().split(":");
      return parts[0] === "us" && /^c\d+$/.test(parts[1] || "");
    }
    static topToken(jur) {
      const parts = (jur || "").toLowerCase().split(":");
      return parts[1] || null;
    }
  };

  // lib/services/moduleLoader.mjs
  var ModuleLoader = class {
    constructor({ rootURI, dataStore }) {
      this.rootURI = rootURI;
      this.dataStore = dataStore;
      this._availableFiles = [];
      this._byFile = /* @__PURE__ */ new Map();
      this._byJur = /* @__PURE__ */ new Map();
    }
    async preload() {
      const idx = await this.dataStore.loadJSON("style-modules/index.json");
      this._availableFiles = idx?.files || [];
      for (const file of this._availableFiles) {
        const path = "style-modules/" + file;
        const xml = await this.dataStore.loadText(path);
        this._byFile.set(file, xml);
        const jur = this._jurFromFilename(file);
        if (jur) this._byJur.set(jur, xml);
      }
      if (!this._byJur.has("us")) {
        const baseFile = this._availableFiles.find((f) => f === "juris-us-IndigoTemp.csl");
        if (baseFile) this._byJur.set("us", this._byFile.get(baseFile));
      }
    }
    _jurFromFilename(file) {
      const m = file.match(/^juris-us\+(.+)-IndigoTemp\.csl$/);
      if (m) return "us:" + m[1];
      if (file === "juris-us-IndigoTemp.csl") return "us";
      return null;
    }
    hasJurisdiction(jur) {
      return this._byJur.has((jur || "").toLowerCase());
    }
    loadJurisdictionStyleSync(jurisdiction, variantName = "IndigoTemp") {
      const variant = variantName || "IndigoTemp";
      if (variant !== "IndigoTemp") return null;
      let jur = (jurisdiction || "us").toLowerCase();
      if (Jurisdiction.isCircuit(jur)) return this._byJur.get("us") || null;
      for (const j of Jurisdiction.trimChain(jur)) {
        if (this._byJur.has(j)) return this._byJur.get(j);
      }
      return this._byJur.get("us") || null;
    }
  };

  // lib/services/abbrevService.mjs
  var AbbrevService = class {
    constructor({ dataStore }) {
      this.dataStore = dataStore;
      this._autoUS = null;
      this._primaryUS = null;
      this._secondaryUS = null;
      this._primaryJur = null;
    }
    async preload() {
      this._autoUS = await this.dataStore.loadJSON("data/auto-us.json");
      this._primaryUS = await this.dataStore.loadJSON("data/primary-us.json");
      this._secondaryUS = await this.dataStore.loadJSON("data/secondary-us-bluebook.json");
      this._primaryJur = await this.dataStore.loadJSON("data/primary-jurisdictions.json");
    }
    normalizeKey(s) {
      return (s || "").toString().trim().toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/[^a-z0-9\s\.-]/g, " ").replace(/\s+/g, " ").trim();
    }
    parseDirective(val) {
      if (!val) return { value: val, directive: null };
      const m = /^!([a-z-]+)\>\>\>(.+)$/.exec(val);
      if (!m) return { value: val, directive: null };
      return { value: m[2], directive: m[1] };
    }
    lookupSync(listname, key, jur) {
      const j = (jur || "us").toLowerCase();
      const kNorm = this.normalizeKey(key);
      if (listname === "institution-part") {
        return lookupJurChain(this._autoUS?.xdata, j, "institution-part", key) || lookupJurChain(this._autoUS?.xdata, j, "institution-part", kNorm);
      }
      if (listname === "place") {
        const upper = j.toUpperCase();
        return this._primaryJur?.xdata?.default?.place?.[upper] || this._autoUS?.xdata?.default?.place?.[upper] || null;
      }
      if (listname === "container-title") {
        return lookupJurChain(this._primaryUS?.xdata, j, "container-title", kNorm) || this._secondaryUS?.xdata?.default?.["container-title"]?.[kNorm] || null;
      }
      return null;
    }
  };
  function lookupJurChain(xdata, jur, variable, key) {
    if (!xdata) return null;
    const parts = (jur || "us").toLowerCase().split(":");
    for (let i = parts.length; i >= 1; i--) {
      const jj = parts.slice(0, i).join(":");
      const obj2 = xdata?.[jj]?.[variable];
      if (obj2 && obj2[key] != null) return obj2[key];
    }
    const obj = xdata?.["us"]?.[variable];
    if (obj && obj[key] != null) return obj[key];
    return null;
  }

  // lib/services/patcher.mjs
  var Patcher = class {
    constructor({ moduleLoader, abbrevService, jurisdiction }) {
      this.moduleLoader = moduleLoader;
      this.abbrevService = abbrevService;
      this.Jurisdiction = jurisdiction;
      this._orig = {};
    }
    patch() {
      this._patchRetrieveItem();
      this._patchAbbreviations();
      this._patchLoadJurisdictionStyle();
      this._patchGetCiteProcFallback();
    }
    unpatch() {
      const sysProto = Zotero?.Cite?.System?.prototype;
      if (sysProto) {
        if (this._orig.retrieveItem) sysProto.retrieveItem = this._orig.retrieveItem;
        if (this._orig.getAbbreviation) sysProto.getAbbreviation = this._orig.getAbbreviation;
        if (this._orig.loadJurisdictionStyle) sysProto.loadJurisdictionStyle = this._orig.loadJurisdictionStyle;
        if (this._orig.retrieveStyleModule) sysProto.retrieveStyleModule = this._orig.retrieveStyleModule;
      }
      if (this._orig.getCiteProc) Zotero.Style.prototype.getCiteProc = this._orig.getCiteProc;
    }
    _patchRetrieveItem() {
      const sysProto = Zotero?.Cite?.System?.prototype;
      if (!sysProto?.retrieveItem) return;
      this._orig.retrieveItem = sysProto.retrieveItem;
      const self = this;
      sysProto.retrieveItem = async function(id) {
        const cslItem = await self._orig.retrieveItem.call(this, id);
        try {
          const zotItem = Zotero.Items.get(id);
          if (zotItem) {
            const jur = self.Jurisdiction.fromItem(zotItem);
            cslItem.jurisdiction = jur;
            cslItem.country = jur.split(":")[0];
          }
        } catch (e) {
        }
        return cslItem;
      };
    }
    _patchAbbreviations() {
      const sysProto = Zotero?.Cite?.System?.prototype;
      if (!sysProto?.getAbbreviation) return;
      this._orig.getAbbreviation = sysProto.getAbbreviation;
      const self = this;
      sysProto.getAbbreviation = function(listname, obj, jurisdiction, lang) {
        try {
          const key = obj?.long || obj?.value || obj?.literal || "";
          const jur = (jurisdiction || obj?.jurisdiction || "us").toLowerCase();
          const v = self.abbrevService.lookupSync(listname, key, jur);
          if (v) return self.abbrevService.parseDirective(v).value;
        } catch (e) {
        }
        return self._orig.getAbbreviation.call(this, listname, obj, jurisdiction, lang);
      };
    }
    _patchLoadJurisdictionStyle() {
      const sysProto = Zotero?.Cite?.System?.prototype;
      if (!sysProto) return;
      if (sysProto.loadJurisdictionStyle) this._orig.loadJurisdictionStyle = sysProto.loadJurisdictionStyle;
      if (sysProto.retrieveStyleModule) this._orig.retrieveStyleModule = sysProto.retrieveStyleModule;
      const self = this;
      sysProto.loadJurisdictionStyle = function(jurisdiction, variantName) {
        const xml = self.moduleLoader.loadJurisdictionStyleSync(jurisdiction, variantName);
        if (xml) return xml;
        if (self._orig.loadJurisdictionStyle) return self._orig.loadJurisdictionStyle.call(this, jurisdiction, variantName);
        return null;
      };
      sysProto.retrieveStyleModule = function(jurisdiction, variantName) {
        const xml = self.moduleLoader.loadJurisdictionStyleSync(jurisdiction, variantName);
        if (xml) return xml;
        if (self._orig.retrieveStyleModule) return self._orig.retrieveStyleModule.call(this, jurisdiction, variantName);
        return null;
      };
    }
    _patchGetCiteProcFallback() {
      const proto = Zotero?.Style?.prototype;
      if (!proto?.getCiteProc) return;
      this._orig.getCiteProc = proto.getCiteProc;
      const self = this;
      proto.getCiteProc = async function(...args) {
        const styleXML = await self._getStyleXML(this);
        if (!styleXML || !styleXML.includes('jurisdiction-preference="IndigoTemp"')) {
          return await self._orig.getCiteProc.apply(this, args);
        }
        let patched = styleXML.replace(/\[HINT:[^\]]+\]/g, "");
        const restore = self._tempSetXML(this, patched);
        try {
          return await self._orig.getCiteProc.apply(this, args);
        } finally {
          restore();
        }
      };
    }
    async _getStyleXML(styleObj) {
      if (styleObj._xml) return styleObj._xml;
      if (styleObj._style) return styleObj._style;
      if (styleObj.file && styleObj.file.exists()) {
        return await Zotero.File.getContentsAsync(styleObj.file);
      }
      return null;
    }
    _tempSetXML(styleObj, xml) {
      const prev = { _xml: styleObj._xml, _style: styleObj._style };
      if ("_xml" in styleObj) styleObj._xml = xml;
      if ("_style" in styleObj) styleObj._style = xml;
      return () => {
        if ("_xml" in styleObj) styleObj._xml = prev._xml;
        if ("_style" in styleObj) styleObj._style = prev._style;
      };
    }
  };

  // lib/main.mjs
  var _ctx;
  async function activate({ id, version, rootURI }) {
    _ctx = {
      id,
      version,
      rootURI,
      data: new DataStore(rootURI),
      modules: null,
      abbrevs: null,
      patcher: null
    };
    await _ctx.data.init();
    _ctx.modules = new ModuleLoader({ rootURI, dataStore: _ctx.data });
    await _ctx.modules.preload();
    _ctx.abbrevs = new AbbrevService({ dataStore: _ctx.data });
    await _ctx.abbrevs.preload();
    _ctx.patcher = new Patcher({
      moduleLoader: _ctx.modules,
      abbrevService: _ctx.abbrevs,
      jurisdiction: Jurisdiction
    });
    _ctx.patcher.patch();
    Zotero.debug(`[IndigoBook CSL-M] activated v${version}`);
  }
  async function deactivate() {
    try {
      _ctx?.patcher?.unpatch();
    } finally {
      _ctx = null;
    }
  }
  return __toCommonJS(main_exports);
})();
