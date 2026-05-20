import { openDb, migrate } from '../src/db.js';
import { evaluateRules, recentFirings, popPendingDesktopNotifications } from '../src/rules.js';

const db = openDb();
migrate(db);
const result = await evaluateRules(db);
console.log('eval:', result);
console.log('firings (all, last 5):', recentFirings(db, null, 5));
console.log('pending desktop notifs:', popPendingDesktopNotifications(db, 5));
