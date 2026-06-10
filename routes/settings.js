const express = require('express');
const router = express.Router();
const db = require('../database');

const VALID_TYPES = [
  'owner', 'location', 'collection_theme', 'category', 'medium', 'condition', 'curation_recommendation'
];

// GET all lookup values grouped by type
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM lookup_values ORDER BY type, sort_order, value'
    ).all();
    const grouped = {};
    VALID_TYPES.forEach(t => { grouped[t] = []; });
    rows.forEach(r => {
      if (grouped[r.type]) grouped[r.type].push(r);
    });
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET values for a specific type (active only)
router.get('/:type', (req, res) => {
  try {
    if (!VALID_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const rows = db.prepare(
      'SELECT * FROM lookup_values WHERE type = ? AND active = 1 ORDER BY sort_order, value'
    ).all(req.params.type);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add new value
router.post('/', (req, res) => {
  try {
    const { type, value } = req.body;
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!value?.trim()) return res.status(400).json({ error: 'Value required' });

    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as m FROM lookup_values WHERE type = ?'
    ).get(type);

    const result = db.prepare(
      'INSERT OR IGNORE INTO lookup_values (type, value, sort_order) VALUES (?, ?, ?)'
    ).run(type, value.trim(), maxOrder.m + 1);

    const row = db.prepare('SELECT * FROM lookup_values WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update (rename or reorder)
router.put('/:id', (req, res) => {
  try {
    const { value, sort_order, active } = req.body;
    db.prepare(`
      UPDATE lookup_values SET
        value = COALESCE(?, value),
        sort_order = COALESCE(?, sort_order),
        active = COALESCE(?, active)
      WHERE id = ?
    `).run(value?.trim() || null, sort_order ?? null, active ?? null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (soft delete - hides from dropdowns, preserves existing data)
router.delete('/:id', (req, res) => {
  try {
    db.prepare('UPDATE lookup_values SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
