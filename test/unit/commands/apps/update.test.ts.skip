import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('apps:update command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockAccountId = 'test-account-id';

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  describe('successful app updates', () => {
    test
      .stdout()
      .do(() => {
        // Mock the app update endpoint
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`, {
            name: 'Updated App Name'
          })
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: 'Updated App Name',
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name'])
      .it('should update app name successfully', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
        expect(ctx.stdout).to.include(`App ID: ${mockAppId}`);
        expect(ctx.stdout).to.include('Name: Updated App Name');
        expect(ctx.stdout).to.include('Status: active');
        expect(ctx.stdout).to.include('TLS Only: No');
      });

    test
      .stdout()
      .do(() => {
        // Mock the app update endpoint for TLS-only
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`, {
            tlsOnly: true
          })
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: 'Test App',
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: true
          });
      })
      .command(['apps:update', mockAppId, '--tls-only'])
      .it('should update app TLS-only setting successfully', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
        expect(ctx.stdout).to.include('TLS Only: Yes');
      });

    test
      .stdout()
      .do(() => {
        // Mock the app update endpoint for both name and TLS
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`, {
            name: 'Updated App Name',
            tlsOnly: true
          })
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: 'Updated App Name',
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: true,
            apnsUsesSandboxCert: true
          });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name', '--tls-only'])
      .it('should update both name and TLS-only setting', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
        expect(ctx.stdout).to.include('Name: Updated App Name');
        expect(ctx.stdout).to.include('TLS Only: Yes');
        expect(ctx.stdout).to.include('APNS Uses Sandbox Cert: Yes');
      });

    test
      .stdout()
      .do(() => {
        const mockApp = {
          id: mockAppId,
          accountId: mockAccountId,
          name: 'Updated App Name',
          status: 'active',
          created: Date.now(),
          modified: Date.now(),
          tlsOnly: false
        };

        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(200, mockApp);
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name', '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', true);
        expect(result).to.have.property('app');
        expect(result.app).to.have.property('id', mockAppId);
        expect(result.app).to.have.property('name', 'Updated App Name');
        expect(result.app).to.have.property('tlsOnly', false);
      });

    test
      .stdout()
      .do(() => {
        const customToken = 'custom_access_token';

        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .patch(`/v1/apps/${mockAppId}`)
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: 'Updated App Name',
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name', '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
      });
  });

  describe('parameter validation', () => {
    test
      .command(['apps:update', mockAppId])
      .catch(error => {
        expect(error.message).to.include('At least one update parameter');
      })
      .it('should require at least one update parameter');

    test
      .stdout()
      .command(['apps:update', mockAppId, '--json'])
      .it('should handle missing parameters in JSON format', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', false);
        expect(result).to.have.property('status', 'error');
        expect(result).to.have.property('error');
        expect(result.error).to.include('At least one update parameter');
        expect(result).to.have.property('appId', mockAppId);
      });

    test
      .command(['apps:update'])
      .catch(error => {
        expect(error.message).to.include('Missing required argument');
      })
      .it('should require app ID argument');
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name'])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name'])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock not found response
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(404, { error: 'App not found' });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name'])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 app not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name'])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .do(() => {
        // Mock validation error
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(400, { 
            error: 'Validation failed',
            details: 'App name already exists'
          });
      })
      .command(['apps:update', mockAppId, '--name', 'Duplicate Name'])
      .catch(error => {
        expect(error.message).to.include('400');
      })
      .it('should handle validation errors from API');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .replyWithError('Network error');
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name'])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .stdout()
      .do(() => {
        // Mock server error for JSON output
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['apps:update', mockAppId, '--name', 'Updated App Name', '--json'])
      .it('should handle errors in JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', false);
        expect(result).to.have.property('status', 'error');
        expect(result).to.have.property('error');
        expect(result).to.have.property('appId', mockAppId);
      });

    test
      .do(() => {
        // Mock conflict error
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`)
          .reply(409, { 
            error: 'Conflict',
            details: 'App name already exists in account'
          });
      })
      .command(['apps:update', mockAppId, '--name', 'Existing App Name'])
      .catch(error => {
        expect(error.message).to.include('409');
      })
      .it('should handle 409 conflict error when app name exists');
  });

  describe('parameter edge cases', () => {
    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`, {
            name: ''
          })
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: '',
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:update', mockAppId, '--name', ''])
      .it('should handle empty app name', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
        expect(ctx.stdout).to.include('Name: ');
      });

    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`, {
            name: 'a'.repeat(100)
          })
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: 'a'.repeat(100),
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:update', mockAppId, '--name', 'a'.repeat(100)])
      .it('should handle very long app names', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
        expect(ctx.stdout).to.include('Name: ' + 'a'.repeat(100));
      });

    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .patch(`/v1/apps/${mockAppId}`, {
            name: 'App with special chars !@#$%^&*()'
          })
          .reply(200, {
            id: mockAppId,
            accountId: mockAccountId,
            name: 'App with special chars !@#$%^&*()',
            status: 'active',
            created: Date.now(),
            modified: Date.now(),
            tlsOnly: false
          });
      })
      .command(['apps:update', mockAppId, '--name', 'App with special chars !@#$%^&*()'])
      .it('should handle special characters in app name', ctx => {
        expect(ctx.stdout).to.include('App updated successfully!');
        expect(ctx.stdout).to.include('Name: App with special chars !@#$%^&*()');
      });
  });
});