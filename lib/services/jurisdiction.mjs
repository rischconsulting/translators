export class Jurisdiction {
  static fromItem(item) {
    const extra = (item.getField?.('extra') || item.extra || '') + '';
    let jur = this._fromMLZ(extra) || this._fromKeyValue(extra);
    if (!jur) jur = 'us';
    return (jur + '').trim().toLowerCase();
  }

  static _fromMLZ(extra) {
    const idx = extra.indexOf('mlzsync1:');
    if (idx === -1) return null;
    const brace = extra.indexOf('{', idx);
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
    const parts = (jur || 'us').toLowerCase().split(':');
    const chain = [];
    for (let i = parts.length; i >= 1; i--) chain.push(parts.slice(0, i).join(':'));
    return chain;
  }

  static isCircuit(jur) {
    const parts = (jur || '').toLowerCase().split(':');
    return parts[0] === 'us' && /^c\d+$/.test(parts[1] || '');
  }

  static topToken(jur) {
    const parts = (jur || '').toLowerCase().split(':');
    return parts[1] || null;
  }
}
