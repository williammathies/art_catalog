'use strict';

const request = require('supertest');
const app = require('../server');
const db = require('../database');

beforeEach(() => {
  db.prepare('DELETE FROM activity_log').run();
  db.prepare('DELETE FROM photos').run();
  db.prepare('DELETE FROM pieces').run();
});

describe('GET /api/activity', () => {
  it('returns an empty array when there is no activity', async () => {
    const res = await request(app).get('/api/activity');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('logs a created event when a piece is added', async () => {
    await request(app).post('/api/pieces').send({ title: 'Logged Piece' });
    const res = await request(app).get('/api/activity');
    const entry = res.body.find(e => e.action === 'created');
    expect(entry).toBeDefined();
    expect(entry.piece_title).toBe('Logged Piece');
  });

  it('logs a deleted event when a piece is removed', async () => {
    const { body: p } = await request(app).post('/api/pieces').send({ title: 'Will Be Deleted' });
    await request(app).delete(`/api/pieces/${p.id}`);
    const res = await request(app).get('/api/activity');
    const entry = res.body.find(e => e.action === 'deleted');
    expect(entry).toBeDefined();
    expect(entry.piece_title).toBe('Will Be Deleted');
  });

  it('logs field-level update events when a piece changes', async () => {
    const { body: p } = await request(app).post('/api/pieces').send({ title: 'Original' });
    await request(app).put(`/api/pieces/${p.id}`).send({ title: 'Changed', artist: 'Someone' });
    const res = await request(app).get('/api/activity');
    const updates = res.body.filter(e => e.action === 'updated');
    expect(updates.length).toBeGreaterThan(0);
    const titleChange = updates.find(e => e.field_name === 'title');
    expect(titleChange.old_value).toBe('Original');
    expect(titleChange.new_value).toBe('Changed');
  });

  it('logs an imported event when pieces are imported', async () => {
    await request(app)
      .post('/api/pieces/import/json')
      .send({ pieces: [{ title: 'Imported Piece' }] });
    const res = await request(app).get('/api/activity');
    const entry = res.body.find(e => e.action === 'imported');
    expect(entry).toBeDefined();
    expect(entry.piece_title).toBe('Imported Piece');
  });

  it('respects the limit query parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/pieces').send({ title: `Piece ${i}` });
    }
    const res = await request(app).get('/api/activity?limit=3');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });
});
