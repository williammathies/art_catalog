// Runs in the test worker before each test file is loaded.
// Sets DB_PATH so database.js uses the test database instead of the real one.
const path = require('path');
process.env.DB_PATH = path.join(__dirname, '..', 'data', 'test-catalog.db');
