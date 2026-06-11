'use strict';

const request = require('supertest');
const app = require('../server');
const db = require('../database');

// Settings tests only add/remove their own values and clean up afterwards.
// They never wipe the lookup_values table so seed data remains intact.

describe('GET /api/settings', () => {
  it('returns lookup values grouped by the seven expected types', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    for (const type of ['owner','location','collection_theme','category','medium','condition','curation_recommendation']) {
      expect(res.body).toHaveProperty(type);
      expect(Array.isArray(res.body[type])).toBe(true);
    }
  });

  it('seed data is present on a fresh database', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.body.owner.map(v => v.value)).toContain('Will');
    expect(res.body.condition.map(v => v.value)).toContain('Excellent');
  });
});

describe('GET /api/settings/:type', () => {
  it('returns only active values for a valid type', async () => {
    const res = await request(app).get('/api/settings/owner');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every(v => v.active === 1)).toBe(true);
  });

  it('returns 400 for an invalid type', async () => {
    const res = await request(app).get('/api/settings/not_a_type');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/settings', () => {
  it('adds a new lookup value', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ type: 'owner', value: '__test_owner__' });
    expect(res.status).toBe(201);
    expect(res.body.value).toBe('__test_owner__');
    expect(res.body.active).toBe(1);
    db.prepare('DELETE FROM lookup_values WHERE value = ?').run('__test_owner__');
  });

  it('returns 400 for an invalid type', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ type: 'bogus', value: 'X' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when value is blank', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ type: 'category', value: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/settings/:id (soft delete)', () => {
  it('sets active=0 so the value disappears from the type list', async () => {
    const add = await request(app)
      .post('/api/settings').send({ type: 'category', value: '__test_cat__' });
    const id = add.body.id;

    const del = await request(app).delete(`/api/settings/${id}`);
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/settings/category');
    expect(list.body.find(v => v.id === id)).toBeUndefined();

    db.prepare('DELETE FROM lookup_values WHERE id = ?').run(id);
  });
});

describe('PUT /api/settings/:id', () => {
  it('reactivates a soft-deleted value', async () => {
    const add = await request(app)
      .post('/api/settings').send({ type: 'medium', value: '__test_medium__' });
    const id = add.body.id;
    await request(app).delete(`/api/settings/${id}`);

    const reactivate = await request(app)
      .put(`/api/settings/${id}`).send({ active: 1 });
    expect(reactivate.status).toBe(200);

    const list = await request(app).get('/api/settings/medium');
    expect(list.body.find(v => v.id === id)).toBeDefined();

    db.prepare('DELETE FROM lookup_values WHERE id = ?').run(id);
  });
});
