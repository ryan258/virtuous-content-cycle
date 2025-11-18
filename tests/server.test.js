const request = require('supertest');
const app = require('../server');

describe('API Health Check', () => {
  test('GET /health should return 200 OK', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });
});

describe('Content Creation', () => {
  test('POST /api/content/create should create new content with valid data', async () => {
    const response = await request(app)
      .post('/api/content/create')
      .send({
        originalInput: 'Test content for refinement',
        metadata: {
          contentType: 'test_content',
          targetAudience: 'developers',
          maxCycles: 3,
          convergenceThreshold: 0.8,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('cycle', 1);
    expect(response.body).toHaveProperty('status', 'awaiting_focus_group');
    expect(response.body.originalInput).toBe('Test content for refinement');
  });

  test('POST /api/content/create should fail with missing fields', async () => {
    const response = await request(app)
      .post('/api/content/create')
      .send({
        originalInput: 'Test content',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });
});

describe('Personas API', () => {
  test('GET /api/personas should return seeded personas', async () => {
    const response = await request(app).get('/api/personas');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  test('POST /api/personas should create a persona and DELETE should remove when unused', async () => {
    const createRes = await request(app)
      .post('/api/personas')
      .send({
        name: 'Test Persona',
        type: 'random',
        persona: 'A concise reviewer',
        systemPrompt: 'You are concise.'
      });
    expect(createRes.status).toBe(201);
    const createdId = createRes.body.id;

    const deleteRes = await request(app).delete(`/api/personas/${createdId}`);
    expect(deleteRes.status).toBe(200);
  });
});

describe('Content creation with personaIds', () => {
  test('POST /api/content/create accepts personaIds array', async () => {
    const personasRes = await request(app).get('/api/personas');
    const personaIds = personasRes.body.slice(0, 2).map(p => p.id);

    const response = await request(app)
      .post('/api/content/create')
      .send({
        originalInput: 'Persona-based content',
        metadata: {
          contentType: 'test_content',
          targetAudience: 'reviewers',
          maxCycles: 2,
          convergenceThreshold: 0.7,
          personaIds
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.metadata.focusGroupConfig.personaIds).toEqual(personaIds);
  });
});
