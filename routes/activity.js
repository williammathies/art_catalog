const express = require('express');
const router = express.Router();
const db = require('../database');

// GET recent activity (all pieces or specific piece)
router.get('/', (req, res) => {
  try {
    const { piece_id, limit = 50 } = req.query;
    let query = 'SELECT * FROM activity_log';
    const params = [];
    if (piece_id) {
      query += ' WHERE piece_id = ?';
      params.push(piece_id);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
