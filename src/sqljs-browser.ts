// Vite resolves the wasm to a hashed asset URL under the configured `base`
// (`/personal-library-backup-merger/assets/sql-wasm-…wasm`), which is what makes sql.js
// load correctly on GitHub Pages. The core never imports this file (it must stay Node-clean).
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { configureSqlJs } from './core/jwlibrary/sqlite';

export function configureSqlJsForBrowser(): void {
  configureSqlJs({ locateFile: () => sqlWasmUrl });
}
