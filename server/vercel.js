// Vercel entry point: the same Express app as `server/index.js`, exported as a
// function instead of listening on a port. `vercel.json` defines it as the `api`
// service and routes /api/* to it; the built client is the other service.
//
// A function's filesystem is read-only except /tmp, so the SQLite file lives
// there. /tmp is per-instance and disappears when the instance is recycled, so
// data resets to the seed (same caveat as the free Render plan in the README).
import './require-esm-shim.js'; // must stay first, see the file for why
import { openDb } from './db.js';
import { createApp } from './app.js';

export default createApp(openDb(process.env.DB_FILE || '/tmp/ajaia.db'));
