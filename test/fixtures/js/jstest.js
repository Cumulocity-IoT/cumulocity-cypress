
const baseUrl = 'https://example.com';

// A simple JavaScript pact file
module.exports = {
  info: { 
    id: 'jstest',
    tenant: 'test-tenant',
    baseUrl,
  },
  records: [
    {
      request: { method: 'GET', url: '/api/test' },
      response: { status: 200 }
    }
  ],
  id: 'jstest'
};