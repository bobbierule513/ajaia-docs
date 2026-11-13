// Vercel's Node launcher runs with require() of ES modules disabled, but
// sanitize-html (CommonJS) loads htmlparser2 with require(), and htmlparser2 has
// been ESM-only since v11. Pinning older versions would drop XSS fixes, so load
// htmlparser2 natively here and seed the CommonJS cache: sanitize-html's
// require() then finds it already loaded. Import this before anything that
// imports sanitize-html. Not needed (and harmless) on stock Node >= 22.12.
import { createRequire } from 'node:module';
import * as htmlparser2 from 'htmlparser2';

const require = createRequire(import.meta.url);
// Resolve from sanitize-html's point of view so the cache key is the file it asks for.
const file = createRequire(require.resolve('sanitize-html')).resolve('htmlparser2');
require.cache[file] ??= { id: file, filename: file, loaded: true, exports: htmlparser2, children: [], paths: [] };
