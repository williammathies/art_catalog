// Runs once before all test suites. Deletes any stale test database so every
// test run starts from a clean, freshly-migrated + seeded state.
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const testDb = path.join(__dirname, '..', 'data', 'test-catalog.db');
  try { fs.unlinkSync(testDb); } catch(e) { /* not present — fine */ }
};
