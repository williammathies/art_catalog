// Runs once after all test suites. Removes the test database file.
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const testDb = path.join(__dirname, '..', 'data', 'test-catalog.db');
  try { fs.unlinkSync(testDb); } catch(e) { /* already gone — fine */ }
};
