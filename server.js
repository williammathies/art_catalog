const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads dir exists
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/pieces', require('./routes/pieces'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/activity', require('./routes/activity'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Mathies Tucker Art Catalog', timestamp: new Date().toISOString() });
});

// Catch-all: serve frontend for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Art Catalog running at http://localhost:${PORT}`);
  });
}

module.exports = app;
