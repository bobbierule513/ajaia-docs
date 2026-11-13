import { openDb } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;
const db = openDb();
createApp(db).listen(port, () => {
  console.log(`Ajaia Docs API listening on http://localhost:${port}`);
});
