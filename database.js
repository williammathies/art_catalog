const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'catalog.db');

// Ensure data directory exists
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    -- Lookup values for all enumerated fields
    CREATE TABLE IF NOT EXISTS lookup_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(type, value)
    );

    -- Main pieces table
    CREATE TABLE IF NOT EXISTS pieces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      year_acquired INTEGER,
      collection_theme TEXT,
      category TEXT,
      medium TEXT,
      description TEXT,
      owner TEXT,
      is_signed INTEGER DEFAULT 0,
      is_hangable INTEGER DEFAULT 1,
      is_framed INTEGER DEFAULT 0,
      frame_notes TEXT,
      width_inches REAL,
      height_inches REAL,
      condition TEXT,
      estimated_value REAL,
      on_display INTEGER DEFAULT 0,
      location TEXT,
      displaying_since TEXT,
      last_display_date TEXT,
      curation_recommendation TEXT,
      recommendation_date TEXT,
      recommendation_notes TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Photos table (multiple per piece)
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      piece_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT,
      photo_type TEXT DEFAULT 'gallery',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE
    );

    -- Activity log
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      piece_id INTEGER,
      piece_title TEXT,
      action TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE SET NULL
    );
  `);

  // Seed default lookup values if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM lookup_values').get();
  if (count.c === 0) {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO lookup_values (type, value, sort_order) VALUES (?, ?, ?)'
    );
    const seedMany = db.transaction((items) => {
      items.forEach(([type, value, order]) => insert.run(type, value, order));
    });

    seedMany([
      // Owners
      ['owner', 'Will', 0],
      ['owner', 'Catherine', 1],
      // Locations
      ['location', 'Attic Office', 0],
      ['location', 'Living Room', 1],
      ['location', 'Bedroom', 2],
      ['location', 'Storage', 3],
      // Collections/Themes
      ['collection_theme', 'Star Wars', 0],
      ['collection_theme', 'Gaming', 1],
      ['collection_theme', 'Edwin Salas', 2],
      ['collection_theme', 'Asheville', 3],
      ['collection_theme', 'Family', 4],
      ['collection_theme', 'General', 5],
      // Categories
      ['category', 'Painting', 0],
      ['category', 'Print', 1],
      ['category', 'Linocut', 2],
      ['category', 'Poster', 3],
      ['category', 'Figure', 4],
      ['category', 'Sculpture', 5],
      ['category', 'Photography', 6],
      ['category', 'Mixed Media', 7],
      // Mediums
      ['medium', 'Oil', 0],
      ['medium', 'Acrylic', 1],
      ['medium', 'Watercolor', 2],
      ['medium', 'Carved Wood', 3],
      ['medium', 'Screen Print', 4],
      ['medium', 'Linocut', 5],
      ['medium', 'Digital Print', 6],
      ['medium', 'Pencil', 7],
      ['medium', 'Mixed Media', 8],
      // Conditions
      ['condition', 'Excellent', 0],
      ['condition', 'Good', 1],
      ['condition', 'Fair', 2],
      ['condition', 'Poor', 3],
      ['condition', 'Needs Restoration', 4],
      // Curation recommendations
      ['curation_recommendation', 'Keep', 0],
      ['curation_recommendation', 'Rotate Out', 1],
      ['curation_recommendation', 'Retire', 2],
      ['curation_recommendation', 'Needs Review', 3],
      ['curation_recommendation', 'Undecided', 4],
    ]);
  }

  console.log('Database migrations complete');
}

migrate();

// Add columns introduced after initial release
try { db.exec('ALTER TABLE pieces ADD COLUMN ranking INTEGER'); } catch(e) {}

module.exports = db;
