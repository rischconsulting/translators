export class Patcher {
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
    sysProto.retrieveItem = async function (id) {
      const cslItem = await self._orig.retrieveItem.call(this, id);
      try {
        const zotItem = Zotero.Items.get(id);
        if (zotItem) {
          const jur = self.Jurisdiction.fromItem(zotItem);
          cslItem.jurisdiction = jur;
          cslItem.country = jur.split(':')[0];
        }
      } catch (e) {}
      return cslItem;
    };
  }

  _patchAbbreviations() {
    const sysProto = Zotero?.Cite?.System?.prototype;
    if (!sysProto?.getAbbreviation) return;
    this._orig.getAbbreviation = sysProto.getAbbreviation;

    const self = this;
    sysProto.getAbbreviation = function (listname, obj, jurisdiction, lang) {
      try {
        const key = obj?.long || obj?.value || obj?.literal || '';
        const jur = (jurisdiction || obj?.jurisdiction || 'us').toLowerCase();
        const v = self.abbrevService.lookupSync(listname, key, jur);
        if (v) return self.abbrevService.parseDirective(v).value;
      } catch (e) {}
      return self._orig.getAbbreviation.call(this, listname, obj, jurisdiction, lang);
    };
  }

  _patchLoadJurisdictionStyle() {
    const sysProto = Zotero?.Cite?.System?.prototype;
    if (!sysProto) return;

    // Save originals if present
    if (sysProto.loadJurisdictionStyle) this._orig.loadJurisdictionStyle = sysProto.loadJurisdictionStyle;
    if (sysProto.retrieveStyleModule) this._orig.retrieveStyleModule = sysProto.retrieveStyleModule;

    const self = this;

    // citeproc-js expects sys.loadJurisdictionStyle(jurisdiction, variantName)
    sysProto.loadJurisdictionStyle = function (jurisdiction, variantName) {
      const xml = self.moduleLoader.loadJurisdictionStyleSync(jurisdiction, variantName);
      if (xml) return xml;
      if (self._orig.loadJurisdictionStyle) return self._orig.loadJurisdictionStyle.call(this, jurisdiction, variantName);
      return null;
    };

    // Some builds may call a differently named hook; provide alias
    sysProto.retrieveStyleModule = function (jurisdiction, variantName) {
      const xml = self.moduleLoader.loadJurisdictionStyleSync(jurisdiction, variantName);
      if (xml) return xml;
      if (self._orig.retrieveStyleModule) return self._orig.retrieveStyleModule.call(this, jurisdiction, variantName);
      return null;
    };
  }

  _patchGetCiteProcFallback() {
    // Optional: remove the placeholder warning in juris-title if module loading fails.
    // We inject the base US macros as a safety net; if citeproc loads jurisdiction modules,
    // they will overwrite these later.
    const proto = Zotero?.Style?.prototype;
    if (!proto?.getCiteProc) return;
    this._orig.getCiteProc = proto.getCiteProc;

    const self = this;
    proto.getCiteProc = async function (...args) {
      const styleXML = await self._getStyleXML(this);
      if (!styleXML || !styleXML.includes('jurisdiction-preference="IndigoTemp"')) {
        return await self._orig.getCiteProc.apply(this, args);
      }
      // Replace the obvious placeholder hint line if present
      let patched = styleXML.replace(/\[HINT:[^\]]+\]/g, '');
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
    if ('_xml' in styleObj) styleObj._xml = xml;
    if ('_style' in styleObj) styleObj._style = xml;
    return () => {
      if ('_xml' in styleObj) styleObj._xml = prev._xml;
      if ('_style' in styleObj) styleObj._style = prev._style;
    };
  }
}
