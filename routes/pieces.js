const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');

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

// Helper: build WHERE clause + params from filter query params
// Supports __null__ sentinel for any nullable field to filter IS NULL rows.
function buildFilters(params) {
  let where = 'WHERE 1=1';
  const vals = [];
  const { search, collection_theme, category, owner, location, on_display, condition, ranking, has_photos } = params;

  if (search) {
    where += ' AND (title LIKE ? OR artist LIKE ? OR notes LIKE ? OR description LIKE ?)';
    const s = `%${search}%`;
    vals.push(s, s, s, s);
  }

  for (const [field, val] of [
    ['collection_theme', collection_theme],
    ['category', category],
    ['owner', owner],
    ['location', location],
    ['condition', condition],
  ]) {
    if (val === '__null__') { where += ` AND ${field} IS NULL`; }
    else if (val) { where += ` AND ${field} = ?`; vals.push(val); }
  }

  if (on_display === '__null__') {
    where += ' AND on_display IS NULL';
  } else if (on_display !== undefined && on_display !== '') {
    where += ' AND on_display = ?';
    vals.push(on_display === 'true' || on_display === '1' ? 1 : 0);
  }

  if (ranking === '__null__') { where += ' AND ranking IS NULL'; }
  else if (ranking) { where += ' AND ranking = ?'; vals.push(parseInt(ranking)); }

  if (has_photos === 'with') { where += ' AND id IN (SELECT DISTINCT piece_id FROM photos)'; }
  else if (has_photos === 'without') { where += ' AND id NOT IN (SELECT DISTINCT piece_id FROM photos)'; }

  return { where, vals };
}

// GET all pieces (with primary photo attached)
router.get('/', (req, res) => {
  try {
    const { where, vals } = buildFilters(req.query);
    const pieces = db.prepare(`SELECT * FROM pieces ${where} ORDER BY title ASC`).all(...vals);

    const getThumb = db.prepare(
      `SELECT * FROM photos WHERE piece_id = ? ORDER BY
       CASE photo_type WHEN 'thumbnail' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END, sort_order LIMIT 1`
    );
    pieces.forEach(p => { p.primary_photo = getThumb.get(p.id) || null; });

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
      curation_recommendation, recommendation_date, recommendation_notes, notes, ranking
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO pieces (
        title, artist, year_acquired, collection_theme, category, medium,
        description, owner, is_signed, is_hangable, is_framed, frame_notes,
        width_inches, height_inches, condition, estimated_value,
        on_display, location, displaying_since, last_display_date,
        curation_recommendation, recommendation_date, recommendation_notes, notes, ranking
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      title, artist || null, year_acquired || null, collection_theme || null,
      category || null, medium || null, description || null, owner || null,
      is_signed ? 1 : 0, is_hangable !== false ? 1 : 0, is_framed ? 1 : 0,
      frame_notes || null, width_inches || null, height_inches || null,
      condition || null, estimated_value || null,
      on_display ? 1 : 0, location || null, displaying_since || null,
      last_display_date || null, curation_recommendation || null,
      recommendation_date || null, recommendation_notes || null, notes || null,
      ranking || null
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
      curation_recommendation, recommendation_date, recommendation_notes, notes, ranking
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });

    db.prepare(`
      UPDATE pieces SET
        title=?, artist=?, year_acquired=?, collection_theme=?, category=?, medium=?,
        description=?, owner=?, is_signed=?, is_hangable=?, is_framed=?, frame_notes=?,
        width_inches=?, height_inches=?, condition=?, estimated_value=?,
        on_display=?, location=?, displaying_since=?, last_display_date=?,
        curation_recommendation=?, recommendation_date=?, recommendation_notes=?,
        notes=?, ranking=?, updated_at=datetime('now')
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
      notes || null, ranking || null, req.params.id
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

// GET export collection as JSON — respects all active filters
router.get('/export/json', (req, res) => {
  try {
    const { where, vals } = buildFilters(req.query);
    const pieces = db.prepare(`SELECT * FROM pieces ${where} ORDER BY title`).all(...vals);

    const photoMap = {};
    if (pieces.length) {
      const placeholders = pieces.map(() => '?').join(',');
      const photos = db.prepare(
        `SELECT * FROM photos WHERE piece_id IN (${placeholders}) ORDER BY piece_id, sort_order`
      ).all(...pieces.map(p => p.id));
      photos.forEach(ph => {
        if (!photoMap[ph.piece_id]) photoMap[ph.piece_id] = [];
        photoMap[ph.piece_id].push(ph);
      });
    }
    pieces.forEach(p => { p.photos = photoMap[p.id] || []; });

    res.setHeader('Content-Disposition', 'attachment; filename="mathies-tucker-art-collection.json"');
    res.json({ exported_at: new Date().toISOString(), collection: 'Mathies Tucker Home', pieces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET export collection as HTML catalog — respects all active filters, embeds thumbnail photos
router.get('/export/html', (req, res) => {
  try {
    const { where, vals } = buildFilters(req.query);
    const pieces = db.prepare(`SELECT * FROM pieces ${where} ORDER BY title`).all(...vals);

    const photoMap = {};
    if (pieces.length) {
      const placeholders = pieces.map(() => '?').join(',');
      const photos = db.prepare(
        `SELECT * FROM photos WHERE piece_id IN (${placeholders}) ORDER BY piece_id, sort_order`
      ).all(...pieces.map(p => p.id));
      photos.forEach(ph => {
        if (!photoMap[ph.piece_id]) photoMap[ph.piece_id] = [];
        photoMap[ph.piece_id].push(ph);
      });
    }

    const html = buildCatalogHTML(pieces, photoMap, new Date().toISOString());
    res.setHeader('Content-Disposition', 'attachment; filename="mathies-tucker-catalog.html"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildCatalogHTML(pieces, photoMap, exportedAt) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fmtDate = (str) => {
    if (!str) return '';
    try { return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch(e) { return str; }
  };

  const starsText = (r) => r ? '★'.repeat(r) + '☆'.repeat(5 - r) : '';

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const onDisplay = pieces.filter(p => p.on_display).length;

  const pieceSections = pieces.map(p => {
    const photos = (photoMap[p.id] || []).map(ph => {
      try {
        const files = JSON.parse(ph.filename);
        const thumbPath = path.join(uploadsDir, String(p.id), files.thumb);
        if (fs.existsSync(thumbPath)) {
          const data = fs.readFileSync(thumbPath);
          return `data:image/jpeg;base64,${data.toString('base64')}`;
        }
      } catch(e) {}
      return null;
    }).filter(Boolean);

    const photosHTML = photos.length
      ? `<div class="piece-photos">${photos.map(src => `<img src="${src}" alt="${esc(p.title)}">`).join('')}</div>`
      : `<div class="piece-photos"><div class="no-photos">No photos</div></div>`;

    const dims = p.width_inches && p.height_inches
      ? `${p.width_inches}" x ${p.height_inches}"`
      : p.width_inches ? `${p.width_inches}" wide`
      : p.height_inches ? `${p.height_inches}" tall`
      : null;

    const fieldRows = [
      ['Artist', p.artist],
      ['Year Acquired', p.year_acquired],
      ['Collection', p.collection_theme],
      ['Category', p.category],
      ['Medium', p.medium],
      ['Owner', p.owner],
      ['Condition', p.condition],
      ['Ranking', p.ranking ? starsText(p.ranking) : null],
      ['Dimensions', dims],
      ['Est. Value', p.estimated_value ? '$' + Number(p.estimated_value).toLocaleString() : null],
      ['Location', p.location],
      ['Display Status', p.on_display ? 'On Display' : 'In Storage'],
      ['Displaying Since', fmtDate(p.displaying_since)],
      ['Last Displayed', fmtDate(p.last_display_date)],
      ['Signed', p.is_signed ? 'Yes' : null],
      ['Framed', p.is_framed ? 'Yes' : null],
      ['Hangable', p.is_hangable ? 'Yes' : null],
      ['Frame Notes', p.frame_notes],
      ['Curation', p.curation_recommendation],
      ['Rec. Date', fmtDate(p.recommendation_date)],
      ['Rec. Notes', p.recommendation_notes],
      ['Added', fmtDate(p.created_at)],
      ['Updated', fmtDate(p.updated_at)],
    ].filter(([, v]) => v);

    return `<div class="piece">
      ${photosHTML}
      <div class="piece-info">
        <h2 class="piece-title">${esc(p.title)}</h2>
        ${p.artist ? `<p class="piece-artist">${esc(p.artist)}</p>` : ''}
        ${p.ranking ? `<p class="piece-stars">${starsText(p.ranking)}</p>` : ''}
        <table class="piece-fields">
          ${fieldRows.map(([label, val]) => `<tr><td class="field-label">${esc(label)}</td><td class="field-val">${esc(String(val))}</td></tr>`).join('')}
        </table>
        ${p.description ? `<div class="piece-desc"><span class="desc-label">Description</span>${esc(p.description)}</div>` : ''}
        ${p.notes ? `<div class="piece-desc"><span class="desc-label">Notes</span>${esc(p.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mathies Tucker Art Collection &mdash; Catalog</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Georgia, 'Times New Roman', serif; background: #fafaf8; color: #1a1a18; line-height: 1.5; font-size: 14px; }
header { padding: 32px 48px 24px; border-bottom: 2px solid #c9a84c; margin-bottom: 40px; }
.header-title { font-size: 30px; color: #8b6914; letter-spacing: 0.04em; margin-bottom: 6px; font-weight: normal; }
.header-sub { font-size: 12px; color: #999; font-family: 'Courier New', monospace; }
.header-stats { margin-top: 12px; font-size: 12px; color: #777; font-family: 'Courier New', monospace; display: flex; gap: 24px; flex-wrap: wrap; }
.stat-val { color: #8b6914; font-weight: bold; }
.pieces { max-width: 1000px; margin: 0 auto; padding: 0 48px 80px; }
.piece { display: grid; grid-template-columns: 280px 1fr; gap: 28px; margin-bottom: 48px; padding-bottom: 48px; border-bottom: 1px solid #e0ddd6; }
.piece:last-child { border-bottom: none; }
.piece-photos { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-content: start; }
.piece-photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 3px; border: 1px solid #ddd; background: #eee; }
.piece-photos img:first-child:last-child { grid-column: 1/-1; aspect-ratio: 4/3; }
.no-photos { grid-column: 1/-1; height: 80px; display: flex; align-items: center; justify-content: center; background: #f0ede8; border: 1px dashed #ccc; border-radius: 3px; color: #bbb; font-size: 11px; font-family: 'Courier New', monospace; }
.piece-title { font-size: 22px; color: #1a1a18; margin-bottom: 4px; font-weight: normal; }
.piece-artist { font-size: 13px; color: #888; font-style: italic; margin-bottom: 8px; }
.piece-stars { font-size: 18px; color: #c9a84c; margin-bottom: 10px; letter-spacing: 3px; }
.piece-fields { width: 100%; border-collapse: collapse; font-size: 12px; font-family: 'Courier New', monospace; margin-bottom: 10px; }
.field-label { color: #aaa; padding: 3px 16px 3px 0; vertical-align: top; white-space: nowrap; }
.field-val { color: #333; padding: 3px 0; }
.piece-desc { font-size: 12px; color: #555; margin-top: 10px; padding: 10px 14px; background: #f5f2eb; border-radius: 3px; border-left: 3px solid #c9a84c; line-height: 1.7; }
.desc-label { display: block; font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'Courier New', monospace; margin-bottom: 5px; }
footer { text-align: center; padding: 28px; font-size: 11px; color: #bbb; font-family: 'Courier New', monospace; border-top: 1px solid #e8e5e0; margin-top: 20px; }
@media (max-width: 640px) { .piece { grid-template-columns: 1fr; } .pieces { padding: 0 20px 60px; } header { padding: 24px 20px 16px; } }
@media print {
  body { background: white; font-size: 12px; }
  .piece { break-inside: avoid; page-break-inside: avoid; border-bottom: 1px solid #ccc; }
  header { padding: 16px 24px; margin-bottom: 24px; }
  .pieces { padding: 0 24px 40px; max-width: none; }
}
</style>
</head>
<body>
<header>
  <div class="header-title">Mathies Tucker Art Collection</div>
  <div class="header-sub">Exported ${fmtDate(exportedAt)}</div>
  <div class="header-stats">
    <span><span class="stat-val">${pieces.length}</span> pieces</span>
    <span><span class="stat-val">${onDisplay}</span> on display</span>
    <span><span class="stat-val">${pieces.length - onDisplay}</span> in storage</span>
  </div>
</header>
<div class="pieces">
  ${pieceSections || '<p style="color:#aaa;text-align:center;padding:60px;font-family:monospace">No pieces match the current filters.</p>'}
</div>
<footer>Mathies Tucker Home &mdash; Art Collection Catalog &mdash; ${fmtDate(exportedAt)}</footer>
</body>
</html>`;
}

// POST import from JSON — upserts on id if present, inserts (auto-id) if not
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
        p.year_acquired || null,
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
        p.notes || null,
        p.ranking || null
      ];

      // If id provided and exists - update text fields only, never touch photos
      if (p.id) {
        const existing = db.prepare('SELECT id FROM pieces WHERE id = ?').get(p.id);
        if (existing) {
          db.prepare(`
            UPDATE pieces SET
              title=?, artist=?, year_acquired=?, collection_theme=?, category=?, medium=?,
              description=?, owner=?, is_signed=?, is_hangable=?, is_framed=?,
              frame_notes=?, width_inches=?, height_inches=?, condition=?,
              estimated_value=?, on_display=?, location=?, displaying_since=?,
              last_display_date=?, curation_recommendation=?, recommendation_date=?,
              recommendation_notes=?, notes=?, ranking=?, updated_at=datetime('now')
            WHERE id=?
          `).run(...fields, p.id);
          logActivity(p.id, title, 'updated via import', null, null, null);
          updated++;
          return;
        }
      }

      // Insert - if id provided use it (preserves original id), otherwise auto-assign
      if (p.id) {
        db.prepare(`
          INSERT INTO pieces (id, title, artist, year_acquired, collection_theme, category, medium,
            description, owner, is_signed, is_hangable, is_framed, frame_notes,
            width_inches, height_inches, condition, estimated_value, on_display,
            location, displaying_since, last_display_date, curation_recommendation,
            recommendation_date, recommendation_notes, notes, ranking, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        `).run(p.id, ...fields, p.created_at || null, p.updated_at || null);
        logActivity(p.id, title, 'imported', null, null, null);
      } else {
        const result = db.prepare(`
          INSERT INTO pieces (title, artist, year_acquired, collection_theme, category, medium,
            description, owner, is_signed, is_hangable, is_framed, frame_notes,
            width_inches, height_inches, condition, estimated_value, on_display,
            location, displaying_since, last_display_date, curation_recommendation,
            recommendation_date, recommendation_notes, notes, ranking, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
