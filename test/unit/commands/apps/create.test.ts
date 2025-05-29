import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('apps:create command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAccountId = 'test-account-id';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockAppName = 'Test App';

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  describe('successful app creation', () => {
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

        // Mock the app creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/accounts/${mockAccountId}/apps`, {
            name: mockAppName,
            tlsOnly: false
          })
          .reply(201, {
            id: mockAppId,
            accountId: mockAccountId,
            name: mockAppName,
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:create', '--name', mockAppName])
      .it('should create an app successfully', ctx => {
        expect(ctx.stdout).to.include('App created successfully');
        expect(ctx.stdout).to.include(mockAppId);
        expect(ctx.stdout).to.include(mockAppName);
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

        // Mock the app creation endpoint with TLS only
        nock('https://control.ably.net')
          .post(`/v1/accounts/${mockAccountId}/apps`, {
            name: mockAppName,
            tlsOnly: true
          })
          .reply(201, {
            id: mockAppId,
            accountId: mockAccountId,
            name: mockAppName,
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: true
          });
      })
      .command(['apps:create', '--name', mockAppName, '--tls-only'])
      .it('should create an app with TLS only flag', ctx => {
        expect(ctx.stdout).to.include('App created successfully');
        expect(ctx.stdout).to.include('TLS Only: true');
      });

    test
      .stdout()
      .do(() => {
        const mockApp = {
          id: mockAppId,
          accountId: mockAccountId,
          name: mockAppName,
          status: 'active',
          created: Date.now(),
          modified: Date.now(),
          tlsOnly: false
        };

        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the app creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/accounts/${mockAccountId}/apps`)
          .reply(201, mockApp);
      })
      .command(['apps:create', '--name', mockAppName, '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('id', mockAppId);
        expect(result).to.have.property('name', mockAppName);
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

        // Mock the app creation endpoint
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .post(`/v1/accounts/${mockAccountId}/apps`)
          .reply(201, {
            id: mockAppId,
            accountId: mockAccountId,
            name: mockAppName,
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:create', '--name', mockAppName, '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('App created successfully');
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
      .command(['apps:create', '--name', mockAppName])
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
          .post(`/v1/accounts/${mockAccountId}/apps`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['apps:create', '--name', mockAppName])
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

        // Mock not found response
        nock('https://control.ably.net')
          .post(`/v1/accounts/${mockAccountId}/apps`)
          .reply(404, { error: 'Not Found' });
      })
      .command(['apps:create', '--name', mockAppName])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 not found error');

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
          .post(`/v1/accounts/${mockAccountId}/apps`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['apps:create', '--name', mockAppName])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .command(['apps:create'])
      .catch(error => {
        expect(error.message).to.include('Missing required flag');
        expect(error.message).to.include('name');
      })
      .it('should require name parameter');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .get('/v1/me')
          .replyWithError('Network error');
      })
      .command(['apps:create', '--name', mockAppName])
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

        // Mock validation error
        nock('https://control.ably.net')
          .post(`/v1/accounts/${mockAccountId}/apps`)
          .reply(400, { 
            error: 'Validation failed',
            details: 'App name already exists'
          });
      })
      .command(['apps:create', '--name', mockAppName])
      .catch(error => {
        expect(error.message).to.include('400');
      })
      .it('should handle validation errors from API');
  });
});