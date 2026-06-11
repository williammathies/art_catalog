'use strict';

const request = require('supertest');
const app = require('../server');
const db = require('../database');

// Clear transactional tables before each test so every test starts from a
// known-empty state.  lookup_values seed data is left intact.
beforeEach(() => {
  db.prepare('DELETE FROM activity_log').run();
  db.prepare('DELETE FROM photos').run();
  db.prepare('DELETE FROM pieces').run();
});

// ── Health ──────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── Create ──────────────────────────────────────────────────────────────────

describe('POST /api/pieces', () => {
  it('creates a piece and returns it with an auto-assigned id', async () => {
    const res = await request(app)
      .post('/api/pieces')
      .send({ title: 'Star Wars Print', artist: 'Greg', ranking: 4 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Star Wars Print');
    expect(res.body.artist).toBe('Greg');
    expect(res.body.ranking).toBe(4);
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/pieces')
      .send({ artist: 'No Title Artist' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('stores null for every optional field when omitted', async () => {
    const res = await request(app).post('/api/pieces').send({ title: 'Bare' });
    expect(res.status).toBe(201);
    expect(res.body.artist).toBeNull();
    expect(res.body.collection_theme).toBeNull();
    expect(res.body.ranking).toBeNull();
    expect(res.body.condition).toBeNull();
  });
});

// ── Read ─────────────────────────────────────────────────────────────────────

describe('GET /api/pieces', () => {
  it('returns all pieces ordered by title', async () => {
    await request(app).post('/api/pieces').send({ title: 'Zorro' });
    await request(app).post('/api/pieces').send({ title: 'Alpha' });
    const res = await request(app).get('/api/pieces');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Alpha');
  });

  it('attaches primary_photo (null when no photos)', async () => {
    await request(app).post('/api/pieces').send({ title: 'No Photo' });
    const res = await request(app).get('/api/pieces');
    expect(res.body[0].primary_photo).toBeNull();
  });

  it('filters by collection_theme', async () => {
    await request(app).post('/api/pieces').send({ title: 'A', collection_theme: 'Star Wars' });
    await request(app).post('/api/pieces').send({ title: 'B', collection_theme: 'Gaming' });
    const res = await request(app).get('/api/pieces?collection_theme=Star Wars');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('A');
  });

  it('filters by ranking value', async () => {
    await request(app).post('/api/pieces').send({ title: 'Top', ranking: 5 });
    await request(app).post('/api/pieces').send({ title: 'Mid', ranking: 3 });
    const res = await request(app).get('/api/pieces?ranking=5');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Top');
  });

  it('collection_theme=__null__ returns only pieces with no theme set', async () => {
    await request(app).post('/api/pieces').send({ title: 'No Theme' });
    await request(app).post('/api/pieces').send({ title: 'Has Theme', collection_theme: 'Gaming' });
    const res = await request(app).get('/api/pieces?collection_theme=__null__');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('No Theme');
  });

  it('ranking=__null__ returns only unranked pieces', async () => {
    await request(app).post('/api/pieces').send({ title: 'Ranked', ranking: 3 });
    await request(app).post('/api/pieces').send({ title: 'Unranked' });
    const res = await request(app).get('/api/pieces?ranking=__null__');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Unranked');
  });

  it('has_photos=without returns pieces with no photos', async () => {
    await request(app).post('/api/pieces').send({ title: 'Photoless' });
    const res = await request(app).get('/api/pieces?has_photos=without');
    expect(res.body).toHaveLength(1);
  });

  it('has_photos=with returns empty when no piece has photos', async () => {
    await request(app).post('/api/pieces').send({ title: 'Also Photoless' });
    const res = await request(app).get('/api/pieces?has_photos=with');
    expect(res.body).toHaveLength(0);
  });

  it('search matches title', async () => {
    await request(app).post('/api/pieces').send({ title: 'Vader Helmet' });
    await request(app).post('/api/pieces').send({ title: 'Landscape' });
    const res = await request(app).get('/api/pieces?search=vader');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Vader Helmet');
  });
});

describe('GET /api/pieces/:id', () => {
  it('returns a single piece with an empty photos array', async () => {
    const { body: created } = await request(app)
      .post('/api/pieces').send({ title: 'Solo' });
    const res = await request(app).get(`/api/pieces/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Solo');
    expect(Array.isArray(res.body.photos)).toBe(true);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/pieces/99999');
    expect(res.status).toBe(404);
  });
});

// ── Update ───────────────────────────────────────────────────────────────────

describe('PUT /api/pieces/:id', () => {
  it('updates fields and returns the updated piece', async () => {
    const { body: p } = await request(app)
      .post('/api/pieces').send({ title: 'Before' });
    const res = await request(app)
      .put(`/api/pieces/${p.id}`)
      .send({ title: 'After', artist: 'New Artist', ranking: 2 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('After');
    expect(res.body.ranking).toBe(2);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .put('/api/pieces/99999').send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is cleared', async () => {
    const { body: p } = await request(app)
      .post('/api/pieces').send({ title: 'Has Title' });
    const res = await request(app)
      .put(`/api/pieces/${p.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe('DELETE /api/pieces/:id', () => {
  it('deletes the piece and returns success', async () => {
    const { body: p } = await request(app)
      .post('/api/pieces').send({ title: 'Doomed' });
    const del = await request(app).delete(`/api/pieces/${p.id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    const get = await request(app).get(`/api/pieces/${p.id}`);
    expect(get.status).toBe(404);
  });
});

// ── Artist autocomplete ───────────────────────────────────────────────────────

describe('GET /api/pieces/meta/artists', () => {
  it('returns matching artist names', async () => {
    await request(app).post('/api/pieces').send({ title: 'P1', artist: 'Picasso' });
    await request(app).post('/api/pieces').send({ title: 'P2', artist: 'Rembrandt' });
    const res = await request(app).get('/api/pieces/meta/artists?q=pic');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Picasso');
    expect(res.body).not.toContain('Rembrandt');
  });
});

// ── Export JSON ───────────────────────────────────────────────────────────────

describe('GET /api/pieces/export/json', () => {
  it('returns an attachment with all pieces and their photos array', async () => {
    await request(app).post('/api/pieces').send({ title: 'Exported' });
    const res = await request(app).get('/api/pieces/export/json');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.pieces).toHaveLength(1);
    expect(res.body.pieces[0].photos).toBeDefined();
  });

  it('respects filters — only exports matching pieces', async () => {
    await request(app).post('/api/pieces').send({ title: 'Keep', collection_theme: 'Star Wars' });
    await request(app).post('/api/pieces').send({ title: 'Drop', collection_theme: 'Gaming' });
    const res = await request(app).get('/api/pieces/export/json?collection_theme=Star Wars');
    expect(res.body.pieces).toHaveLength(1);
    expect(res.body.pieces[0].title).toBe('Keep');
  });

  it('includes exported_at timestamp and collection name', async () => {
    const res = await request(app).get('/api/pieces/export/json');
    expect(res.body.exported_at).toBeDefined();
    expect(res.body.collection).toBe('Mathies Tucker Home');
  });
});

// ── Export HTML ───────────────────────────────────────────────────────────────

describe('GET /api/pieces/export/html', () => {
  it('returns an HTML attachment containing piece data', async () => {
    await request(app).post('/api/pieces').send({ title: 'Van Gogh Piece', artist: 'Van Gogh' });
    const res = await request(app).get('/api/pieces/export/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toContain('Van Gogh Piece');
    expect(res.text).toContain('Van Gogh');
  });

  it('respects filters — only renders matching pieces', async () => {
    await request(app).post('/api/pieces').send({ title: 'In Catalog', ranking: 5 });
    await request(app).post('/api/pieces').send({ title: 'Excluded', ranking: 1 });
    const res = await request(app).get('/api/pieces/export/html?ranking=5');
    expect(res.text).toContain('In Catalog');
    expect(res.text).not.toContain('Excluded');
  });

  it('renders a no-pieces message when filters match nothing', async () => {
    const res = await request(app).get('/api/pieces/export/html?ranking=5');
    expect(res.text).toContain('No pieces match');
  });
});

// ── Import JSON ───────────────────────────────────────────────────────────────

describe('POST /api/pieces/import/json', () => {
  it('inserts a piece with no id and auto-assigns one', async () => {
    const res = await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ title: 'Auto ID' }] });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.updated).toBe(0);
    const list = await request(app).get('/api/pieces');
    expect(list.body[0].id).toBeDefined();
  });

  it('inserts a piece with an explicit id and preserves that id', async () => {
    const res = await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ id: 777, title: 'Explicit ID' }] });
    expect(res.status).toBe(200);
    const piece = await request(app).get('/api/pieces/777');
    expect(piece.status).toBe(200);
    expect(piece.body.title).toBe('Explicit ID');
  });

  it('updates an existing piece when the id matches', async () => {
    await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ id: 42, title: 'Original' }] });
    await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ id: 42, title: 'Updated', artist: 'New' }] });
    const list = await request(app).get('/api/pieces');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Updated');
  });

  it('does not fail when imported piece has missing optional fields', async () => {
    const res = await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ title: 'Minimal' }] });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    const piece = (await request(app).get('/api/pieces')).body[0];
    expect(piece.artist).toBeNull();
    expect(piece.collection_theme).toBeNull();
    expect(piece.ranking).toBeNull();
  });

  it('per-piece errors are skipped without failing the whole import', async () => {
    // Second piece has no title — should be caught and skipped
    const res = await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ title: 'Good' }, { title: '' }] });
    // Good piece succeeds; bad piece is caught internally
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when the body is not { pieces: [] }', async () => {
    const res = await request(app)
      .post('/api/pieces/import/json')
      .send({ data: [] });
    expect(res.status).toBe(400);
  });
});
