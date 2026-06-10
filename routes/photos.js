const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Multer config - store in memory, we'll write manually after resizing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

function pieceUploadDir(pieceId) {
  const dir = path.join(UPLOADS_DIR, String(pieceId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// GET photos for a piece
router.get('/:pieceId', (req, res) => {
  try {
    const photos = db.prepare(
      'SELECT * FROM photos WHERE piece_id = ? ORDER BY sort_order ASC'
    ).all(req.params.pieceId);
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload photo
router.post('/:pieceId', upload.single('photo'), async (req, res) => {
  try {
    const pieceId = parseInt(req.params.pieceId);
    const piece = db.prepare('SELECT id FROM pieces WHERE id = ?').get(pieceId);
    if (!piece) return res.status(404).json({ error: 'Piece not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const photo_type = req.body.photo_type || 'gallery'; // thumbnail | primary | gallery
    const dir = pieceUploadDir(pieceId);
    const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Save full resolution (max 2400px, quality 85)
    const fullFilename = `${base}-full.jpg`;
    await sharp(req.file.buffer)
      .rotate() // auto-orient from EXIF
      .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(dir, fullFilename));

    // Save thumbnail (400px)
    const thumbFilename = `${base}-thumb.jpg`;
    await sharp(req.file.buffer)
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(dir, thumbFilename));

    // Get current max sort_order
    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as m FROM photos WHERE piece_id = ?'
    ).get(pieceId);

    const result = db.prepare(`
      INSERT INTO photos (piece_id, filename, original_filename, photo_type, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(pieceId, fullFilename, req.file.originalname, photo_type, maxOrder.m + 1);

    // Store thumb filename as separate row or as metadata? 
    // We'll store both in one row using a naming convention (base stays same)
    db.prepare('UPDATE photos SET filename = ? WHERE id = ?')
      .run(JSON.stringify({ full: fullFilename, thumb: thumbFilename }), result.lastInsertRowid);

    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(photo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update photo type or sort order
router.put('/:pieceId/:photoId', (req, res) => {
  try {
    const { photo_type, sort_order } = req.body;
    db.prepare('UPDATE photos SET photo_type = COALESCE(?, photo_type), sort_order = COALESCE(?, sort_order) WHERE id = ? AND piece_id = ?')
      .run(photo_type || null, sort_order ?? null, req.params.photoId, req.params.pieceId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE photo
router.delete('/:pieceId/:photoId', (req, res) => {
  try {
    const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND piece_id = ?')
      .get(req.params.photoId, req.params.pieceId);
    if (!photo) return res.status(404).json({ error: 'Not found' });

    // Delete files
    try {
      const files = JSON.parse(photo.filename);
      const dir = pieceUploadDir(req.params.pieceId);
      if (files.full) fs.unlinkSync(path.join(dir, files.full));
      if (files.thumb) fs.unlinkSync(path.join(dir, files.thumb));
    } catch(e) { /* file may already be gone */ }

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.photoId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
