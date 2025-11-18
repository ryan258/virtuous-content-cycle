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
