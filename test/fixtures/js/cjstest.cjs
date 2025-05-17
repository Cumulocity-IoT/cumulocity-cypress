
const baseUrl = 'https://example.com';

// A CommonJS module pact file
module.exports = {
  info: {
    id: 'cjstest',
    tenant: 'test-tenant',
    baseUrl,
  },
  records: [
    {
      request: { method: 'POST', url: '/api/cjs' },
      response: { status: 201 }
    }
  ],
  id: 'cjstest'
};