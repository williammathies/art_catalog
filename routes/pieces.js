const express = require('express');
const router = express.Router();
const db = require('../database');

// Helper: log activity
function logActivity(piece_id, piece_title, action, field_name, old_value, new_value) {
  db.prepare(`
    INSERT INTO activity_log (piece_id, piece_title, action, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(piece_id, piece_title, action, field_name,
    old_value != null ? String(old_value) : null,
    new_value != null ? String(new_value) : null
  );
}

// Helper: diff two objects and log changes
function logChanges(piece_id, piece_title, oldObj, newObj) {
  const skip = new Set(['id', 'created_at', 'updated_at']);
  for (const key of Object.keys(newObj)) {
    if (skip.has(key)) continue;
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      logActivity(piece_id, piece_title, 'updated', key, oldVal, newVal);
    }
  }
}

// GET all pieces (with photos)
router.get('/', (req, res) => {
  try {
    const { search, collection_theme, category, owner, location, on_display, condition } = req.query;
    let query = 'SELECT * FROM pieces WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (title LIKE ? OR artist LIKE ? OR notes LIKE ? OR description LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (collection_theme) { query += ' AND collection_theme = ?'; params.push(collection_theme); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (owner) { query += ' AND owner = ?'; params.push(owner); }
    if (location) { query += ' AND location = ?'; params.push(location); }
    if (on_display !== undefined && on_display !== '') {
      query += ' AND on_display = ?'; params.push(on_display === 'true' || on_display === '1' ? 1 : 0);
    }
    if (condition) { query += ' AND condition = ?'; params.push(condition); }

    query += ' ORDER BY title ASC';
    const pieces = db.prepare(query).all(...params);

    // Attach primary photo to each piece
    const getThumb = db.prepare(
      `SELECT * FROM photos WHERE piece_id = ? ORDER BY 
       CASE photo_type WHEN 'thumbnail' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END, sort_order LIMIT 1`
    );
    pieces.forEach(p => {
      p.primary_photo = getThumb.get(p.id) || null;
    });

    res.json(pieces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single piece with all photos
router.get('/:id', (req, res) => {
  try {
    const piece = db.prepare('SELECT * FROM pieces WHERE id = ?').get(req.params.id);
    if (!piece) return res.status(404).json({ error: 'Not found' });
    piece.photos = db.prepare(
      'SELECT * FROM photos WHERE piece_id = ? ORDER BY sort_order ASC'
    ).all(piece.id);
    res.json(piece);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create piece
router.post('/', (req, res) => {
  try {
    const {
      title, artist, year_acquired, collection_theme, category, medium,
      description, owner, is_signed, is_hangable, is_framed, frame_notes,
      width_inches, height_inches, condition, estimated_value,
      on_display, location, displaying_since, last_display_date,
      curation_recommendation, recommendation_date, recommendation_notes, notes
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO pieces (
        title, artist, year_acquired, collection_theme, category, medium,
        description, owner, is_signed, is_hangable, is_framed, frame_notes,
        width_inches, height_inches, condition, estimated_value,
        on_display, location, displaying_since, last_display_date,
        curation_recommendation, recommendation_date, recommendation_notes, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      title, artist || null, year_acquired || null, collection_theme || null,
      category || null, medium || null, description || null, owner || null,
      is_signed ? 1 : 0, is_hangable !== false ? 1 : 0, is_framed ? 1 : 0,
      frame_notes || null, width_inches || null, height_inches || null,
      condition || null, estimated_value || null,
      on_display ? 1 : 0, location || null, displaying_since || null,
      last_display_date || null, curation_recommendation || null,
      recommendation_date || null, recommendation_notes || null, notes || null
    );

    const piece = db.prepare('SELECT * FROM pieces WHERE id = ?').get(result.lastInsertRowid);
    logActivity(piece.id, piece.title, 'created', null, null, null);
    res.status(201).json(piece);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update piece
router.put('/:id', (req, res) => {
  try {
    const old = db.prepare('SELECT * FROM pieces WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Not found' });

    const {
      title, artist, year_acquired, collection_theme, category, medium,
      description, owner, is_signed, is_hangable, is_framed, frame_notes,
      width_inches, height_inches, condition, estimated_value,
      on_display, location, displaying_since, last_display_date,
      curation_recommendation, recommendation_date, recommendation_notes, notes
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });

    db.prepare(`
      UPDATE pieces SET
        title=?, artist=?, year_acquired=?, collection_theme=?, category=?, medium=?,
        description=?, owner=?, is_signed=?, is_hangable=?, is_framed=?, frame_notes=?,
        width_inches=?, height_inches=?, condition=?, estimated_value=?,
        on_display=?, location=?, displaying_since=?, last_display_date=?,
        curation_recommendation=?, recommendation_date=?, recommendation_notes=?,
        notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      title, artist || null, year_acquired || null, collection_theme || null,
      category || null, medium || null, description || null, owner || null,
      is_signed ? 1 : 0, is_hangable !== false ? 1 : 0, is_framed ? 1 : 0,
      frame_notes || null, width_inches || null, height_inches || null,
      condition || null, estimated_value || null,
      on_display ? 1 : 0, location || null, displaying_since || null,
      last_display_date || null, curation_recommendation || null,
      recommendation_date || null, recommendation_notes || null,
      notes || null, req.params.id
    );

    const updated = db.prepare('SELECT * FROM pieces WHERE id = ?').get(req.params.id);
    logChanges(updated.id, updated.title, old, updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE piece
router.delete('/:id', (req, res) => {
  try {
    const piece = db.prepare('SELECT * FROM pieces WHERE id = ?').get(req.params.id);
    if (!piece) return res.status(404).json({ error: 'Not found' });
    logActivity(piece.id, piece.title, 'deleted', null, null, null);
    db.prepare('DELETE FROM pieces WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET artist autocomplete
router.get('/meta/artists', (req, res) => {
  try {
    const { q } = req.query;
    const artists = db.prepare(
      `SELECT DISTINCT artist FROM pieces WHERE artist IS NOT NULL AND artist LIKE ? ORDER BY artist LIMIT 10`
    ).all(`%${q || ''}%`);
    res.json(artists.map(a => a.artist));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST export collection as JSON (Claude-friendly format)
router.get('/export/json', (req, res) => {
  try {
    const pieces = db.prepare('SELECT * FROM pieces ORDER BY title').all();
    const photos = db.prepare('SELECT * FROM photos ORDER BY piece_id, sort_order').all();
    const photoMap = {};
    photos.forEach(p => {
      if (!photoMap[p.piece_id]) photoMap[p.piece_id] = [];
      photoMap[p.piece_id].push(p);
    });
    pieces.forEach(p => { p.photos = photoMap[p.id] || []; });
    res.setHeader('Content-Disposition', 'attachment; filename="mathies-tucker-art-collection.json"');
    res.json({ exported_at: new Date().toISOString(), collection: 'Mathies Tucker Home', pieces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST import from JSON — upserts on id if present, inserts if not
router.post('/import/json', (req, res) => {
  try {
    const { pieces } = req.body;
    if (!Array.isArray(pieces)) return res.status(400).json({ error: 'Expected { pieces: [] }' });

    let inserted = 0;
    let updated = 0;

    const upsertPiece = db.transaction((p) => {
      const title = p.title || p.name;
      const fields = [
        title, p.artist || null,
        p.collection_theme || p.category || null,
        p.type || p.category || null,
        p.medium || null, p.description || null,
        p.owner || null,
        p.is_signed ? 1 : 0,
        p.is_hangable !== false ? 1 : 0,
        p.is_framed || p.frameNotes ? 1 : 0,
        p.frame_notes || p.frameNotes || null,
        p.width_inches || null, p.height_inches || null,
        p.condition || null, p.estimated_value || null,
        p.onDisplay === 'display' || p.on_display ? 1 : 0,
        p.location || null,
        p.displaying_since || p.displayingSince || null,
        p.last_display_date || p.lastDisplay || null,
        p.curation_recommendation || p.status || null,
        p.recommendation_date || null,
        p.recommendation_notes || null,
        p.notes || null
      ];

      // If id provided and exists — update text fields only, never touch photos
      if (p.id) {
        const existing = db.prepare('SELECT id FROM pieces WHERE id = ?').get(p.id);
        if (existing) {
          db.prepare(`
            UPDATE pieces SET
              title=?, artist=?, collection_theme=?, category=?, medium=?,
              description=?, owner=?, is_signed=?, is_hangable=?, is_framed=?,
              frame_notes=?, width_inches=?, height_inches=?, condition=?,
              estimated_value=?, on_display=?, location=?, displaying_since=?,
              last_display_date=?, curation_recommendation=?, recommendation_date=?,
              recommendation_notes=?, notes=?, updated_at=datetime('now')
            WHERE id=?
          `).run(...fields, p.id);
          logActivity(p.id, title, 'updated via import', null, null, null);
          updated++;
          return;
        }
      }

      // Insert — if id provided use it (preserves original id), otherwise auto-assign
      if (p.id) {
        db.prepare(`
          INSERT INTO pieces (id, title, artist, collection_theme, category, medium,
            description, owner, is_signed, is_hangable, is_framed, frame_notes,
            width_inches, height_inches, condition, estimated_value, on_display,
            location, displaying_since, last_display_date, curation_recommendation,
            recommendation_date, recommendation_notes, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        `).run(p.id, ...fields, p.created_at || null, p.updated_at || null);
        logActivity(p.id, title, 'imported', null, null, null);
      } else {
        const result = db.prepare(`
          INSERT INTO pieces (title, artist, collection_theme, category, medium,
            description, owner, is_signed, is_hangable, is_framed, frame_notes,
            width_inches, height_inches, condition, estimated_value, on_display,
            location, displaying_since, last_display_date, curation_recommendation,
            recommendation_date, recommendation_notes, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        `).run(...fields, p.created_at || null, p.updated_at || null);
        logActivity(result.lastInsertRowid, title, 'imported', null, null, null);
      }
      inserted++;
    });

    pieces.forEach(p => {
      try { upsertPiece(p); } catch(e) { console.error('Import error for piece:', p.title || p.name, e.message); }
    });

    res.json({ inserted, updated, total: inserted + updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
