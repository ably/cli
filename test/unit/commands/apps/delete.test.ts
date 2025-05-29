import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('apps:delete command', () => {
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

  describe('successful app deletion', () => {
    test
      .stdout()
      .do(() => {
        // Mock the /me endpoint for getApp (listApps)
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the app listing endpoint for getApp
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock the app deletion endpoint
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(204);
      })
      .command(['apps:delete', mockAppId, '--force'])
      .it('should delete app successfully with --force flag', ctx => {
        expect(ctx.stdout).to.include('App deleted successfully');
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

        // Mock the app listing endpoint for getApp
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [mockApp]);

        // Mock the app deletion endpoint
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(204);
      })
      .command(['apps:delete', mockAppId, '--force', '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', true);
        expect(result).to.have.property('app');
        expect(result.app).to.have.property('id', mockAppId);
        expect(result.app).to.have.property('name', mockAppName);
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

        // Mock the app listing endpoint
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock the app deletion endpoint
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .delete(`/v1/apps/${mockAppId}`)
          .reply(204);
      })
      .command(['apps:delete', mockAppId, '--force', '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('App deleted successfully');
      });
  });

  describe('confirmation prompts', () => {
    // NOTE: These tests are skipped because interactive stdin tests cause timeouts in CI
    // TODO: Fix readline mocking to make these tests work reliably
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

        // Mock the app listing endpoint for getApp
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock the app deletion endpoint
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(204);
      })
      .stdin(`${mockAppName}\ny\n`)
      .command(['apps:delete', mockAppId])
      .skip()
      .it('should proceed with deletion when user confirms', ctx => {
        expect(ctx.stdout).to.include('You are about to delete the following app:');
        expect(ctx.stdout).to.include(`App ID: ${mockAppId}`);
        expect(ctx.stdout).to.include(`Name: ${mockAppName}`);
        expect(ctx.stdout).to.include('App deleted successfully');
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

        // Mock the app listing endpoint for getApp
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);
      })
      .stdin('wrong-name\n')
      .command(['apps:delete', mockAppId])
      .skip()
      .it('should cancel deletion when app name doesnt match', ctx => {
        expect(ctx.stdout).to.include('You are about to delete the following app:');
        expect(ctx.stdout).to.include('Deletion cancelled - app name did not match');
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

        // Mock the app listing endpoint for getApp
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);
      })
      .stdin(`${mockAppName}\nn\n`)
      .command(['apps:delete', mockAppId])
      .skip()
      .it('should cancel deletion when user responds no to confirmation', ctx => {
        expect(ctx.stdout).to.include('You are about to delete the following app:');
        expect(ctx.stdout).to.include('Deletion cancelled');
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
      .command(['apps:delete', mockAppId, '--force'])
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

        // Mock app not found
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, []);
      })
      .command(['apps:delete', mockAppId, '--force'])
      .catch(error => {
        expect(error.message).to.include('not found');
      })
      .it('should handle app not found error');

    test
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the app listing endpoint
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock deletion failure
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['apps:delete', mockAppId, '--force'])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle deletion API error');

    test
      .command(['apps:delete'])
      .catch(error => {
        expect(error.message).to.include('No app ID provided');
      })
      .it('should handle missing app ID when no current app is set');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .get('/v1/me')
          .replyWithError('Network error');
      })
      .command(['apps:delete', mockAppId, '--force'])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

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

        // Mock the app listing endpoint
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock deletion failure
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['apps:delete', mockAppId, '--force', '--json'])
      .it('should handle errors in JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', false);
        expect(result).to.have.property('status', 'error');
        expect(result).to.have.property('error');
        expect(result).to.have.property('appId', mockAppId);
      });

    test
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the app listing endpoint
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock forbidden error
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['apps:delete', mockAppId, '--force'])
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

        // Mock the app listing endpoint
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock conflict error (app has dependencies)
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(409, { 
            error: 'Conflict',
            details: 'App has active resources that must be deleted first'
          });
      })
      .command(['apps:delete', mockAppId, '--force'])
      .catch(error => {
        expect(error.message).to.include('409');
      })
      .it('should handle 409 conflict error when app has dependencies');
  });

  describe('current app handling', () => {
    test
      .stdout()
      .env({ ABLY_APP_ID: mockAppId })
      .do(() => {
        // Mock the /me endpoint
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the app listing endpoint for getApp
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: mockAppId,
              accountId: mockAccountId,
              name: mockAppName,
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        // Mock the app deletion endpoint
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}`)
          .reply(204);

        // Mock app listing for switch command after deletion
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, []);
      })
      .command(['apps:delete', '--force'])
      .it('should use current app when no app ID provided', ctx => {
        expect(ctx.stdout).to.include('App deleted successfully');
        expect(ctx.stdout).to.include('The current app was deleted');
      });
  });
});