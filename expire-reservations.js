import { loadConfig } from './server/config.js';
import { expirePendingReservations } from './server/expiry.js';
import { createSquareService } from './server/square.js';

const config = loadConfig();
if (!config.squareConfigured) {
  console.error('Square is not configured; reservation expiration did not run.');
  process.exitCode = 1;
} else {
  const results = await expirePendingReservations({
    dataDir: config.dataDir,
    square: createSquareService(config)
  });
  console.log(`Processed ${results.length} expired or reconciled reservation(s).`);
}
