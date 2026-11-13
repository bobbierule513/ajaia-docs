// Vercel entry point: the same Express app as `server/index.js`, exported as a
// serverless function instead of listening on a port. `vercel.json` rewrites
// every /api/* request here; the built client is served by Vercel's CDN.
//
// A function's filesystem is read-only except /tmp, so the SQLite file lives
// there. /tmp is per-instance and disappears when the instance is recycled, so
// data resets to the seed (same caveat as the free Render plan in the README).
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

export default createApp(openDb(process.env.DB_FILE || '/tmp/ajaia.db'));
