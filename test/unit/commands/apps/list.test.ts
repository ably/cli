import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe } from 'mocha';

describe('apps:list command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAccountId = 'test-account-id';
  const mockApps = [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      accountId: mockAccountId,
      name: 'Test App 1',
      status: 'active',
      created: 1640995200000,
      modified: 1640995200000,
      tlsOnly: false
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      accountId: mockAccountId,
      name: 'Test App 2',
      status: 'active',
      created: 1640995200000,
      modified: 1640995200000,
      tlsOnly: true
    }
  ];

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  describe('successful app listing', () => {
    test
      .stdout()
      .do(() => {
        // Mock the /me endpoint to get account ID
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the apps list endpoint
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, mockApps);
      })
      .command(['apps:list'])
      .it('should list apps successfully', ctx => {
        expect(ctx.stdout).to.include('Test App 1');
        expect(ctx.stdout).to.include('Test App 2');
        expect(ctx.stdout).to.include('550e8400-e29b-41d4-a716-446655440000');
        expect(ctx.stdout).to.include('550e8400-e29b-41d4-a716-446655440001');
      });

    test
      .stdout()
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the apps list endpoint
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, mockApps);
      })
      .command(['apps:list', '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('apps');
        expect(result.apps).to.be.an('array');
        expect(result.apps).to.have.length(2);
        expect(result.apps[0]).to.have.property('id', '550e8400-e29b-41d4-a716-446655440000');
        expect(result.apps[0]).to.have.property('name', 'Test App 1');
        expect(result.apps[1]).to.have.property('id', '550e8400-e29b-41d4-a716-446655440001');
        expect(result.apps[1]).to.have.property('name', 'Test App 2');
      });

    test
      .stdout()
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the apps list endpoint with empty response
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, []);
      })
      .command(['apps:list'])
      .it('should handle empty apps list', ctx => {
        expect(ctx.stdout).to.include('No apps found');
      });

    test
      .stdout()
      .do(() => {
        const customToken = 'custom_access_token';

        // Mock the /me endpoint with custom token
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the apps list endpoint
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, mockApps);
      })
      .command(['apps:list', '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('Test App 1');
        expect(ctx.stdout).to.include('Test App 2');
      });
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['apps:list'])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock forbidden response
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['apps:list'])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock server error
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['apps:list'])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .get('/v1/me')
          .replyWithError('Network error');
      })
      .command(['apps:list'])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock rate limit error
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(429, { error: 'Rate limit exceeded' });
      })
      .command(['apps:list'])
      .catch(error => {
        expect(error.message).to.include('429');
      })
      .it('should handle rate limit errors');
  });

  describe('pagination handling', () => {
    test
      .stdout()
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock large apps list with pagination
        const largeAppsList = Array.from({ length: 100 }, (_, i) => ({
          id: `550e8400-e29b-41d4-a716-44665544${i.toString().padStart(4, '0')}`,
          accountId: mockAccountId,
          name: `Test App ${i + 1}`,
          status: 'active',
          created: 1640995200000,
          modified: 1640995200000,
          tlsOnly: false
        }));

        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, largeAppsList, {
            'Link': '<https://control.ably.net/v1/accounts/test-account-id/apps?limit=100&offset=100>; rel="next"'
          });
      })
      .command(['apps:list'])
      .it('should handle large lists', ctx => {
        expect(ctx.stdout).to.include('Test App 1');
        expect(ctx.stdout).to.include('Test App 100');
      });
  });
});