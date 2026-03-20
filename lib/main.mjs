import { DataStore } from './services/dataStore.mjs';
import { ModuleLoader } from './services/moduleLoader.mjs';
import { AbbrevService } from './services/abbrevService.mjs';
import { Jurisdiction } from './services/jurisdiction.mjs';
import { Patcher } from './services/patcher.mjs';

let _ctx;

export async function activate({ id, version, rootURI }) {
  _ctx = {
    id, version, rootURI,
    data: new DataStore(rootURI),
    modules: null,
    abbrevs: null,
    patcher: null,
  };

  await _ctx.data.init();
  _ctx.modules = new ModuleLoader({ rootURI, dataStore: _ctx.data });
  await _ctx.modules.preload();

  _ctx.abbrevs = new AbbrevService({ dataStore: _ctx.data });
  await _ctx.abbrevs.preload();

  _ctx.patcher = new Patcher({
    moduleLoader: _ctx.modules,
    abbrevService: _ctx.abbrevs,
    jurisdiction: Jurisdiction,
  });
  _ctx.patcher.patch();

  Zotero.debug(`[IndigoBook CSL-M] activated v${version}`);
}

export async function deactivate() {
  try {
    _ctx?.patcher?.unpatch();
  } finally {
    _ctx = null;
  }
}
