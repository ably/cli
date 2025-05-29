import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe } from 'mocha';

describe('auth:keys:create command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockKeyName = 'Test Key';
  const mockKeyId = 'test-key-id';
  const mockKeySecret = 'test-key-secret';

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  describe('successful key creation', () => {
    test
      .stdout()
      .do(() => {
        // Mock the key creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`, {
            name: mockKeyName,
            capability: { '*': ['*'] }
          })
          .reply(201, {
            id: mockKeyId,
            appId: mockAppId,
            name: mockKeyName,
            key: `${mockAppId}.${mockKeyId}:${mockKeySecret}`,
            capability: { '*': ['*'] },
            created: Date.now(),
            modified: Date.now(),
            status: 'enabled',
            revocable: true
          });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .it('should create a key successfully', ctx => {
        expect(ctx.stdout).to.include('Key created successfully');
        expect(ctx.stdout).to.include(mockKeyName);
        expect(ctx.stdout).to.include(mockKeyId);
      });

    test
      .stdout()
      .do(() => {
        // Mock the key creation endpoint with custom capabilities
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`, {
            name: mockKeyName,
            capability: { 'channel1': ['publish', 'subscribe'], 'channel2': ['history'] }
          })
          .reply(201, {
            id: mockKeyId,
            appId: mockAppId,
            name: mockKeyName,
            key: `${mockAppId}.${mockKeyId}:${mockKeySecret}`,
            capability: { 'channel1': ['publish', 'subscribe'], 'channel2': ['history'] },
            created: Date.now(),
            modified: Date.now(),
            status: 'enabled',
            revocable: true
          });
      })
      .command([
        'auth:keys:create',
        '--name', mockKeyName,
        '--app', mockAppId,
        '--capabilities', '{"channel1":["publish","subscribe"],"channel2":["history"]}'
      ])
      .it('should create a key with custom capabilities', ctx => {
        expect(ctx.stdout).to.include('Key created successfully');
        expect(ctx.stdout).to.include('channel1');
        expect(ctx.stdout).to.include('publish');
        expect(ctx.stdout).to.include('subscribe');
      });

    test
      .stdout()
      .do(() => {
        const mockKey = {
          id: mockKeyId,
          appId: mockAppId,
          name: mockKeyName,
          key: `${mockAppId}.${mockKeyId}:${mockKeySecret}`,
          capability: { '*': ['*'] },
          created: Date.now(),
          modified: Date.now(),
          status: 'enabled',
          revocable: true
        };

        // Mock the key creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(201, mockKey);
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId, '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('id', mockKeyId);
        expect(result).to.have.property('name', mockKeyName);
        expect(result).to.have.property('key');
      });

    test
      .stdout()
      .do(() => {
        const customToken = 'custom_access_token';

        // Mock the key creation endpoint with custom token
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(201, {
            id: mockKeyId,
            appId: mockAppId,
            name: mockKeyName,
            key: `${mockAppId}.${mockKeyId}:${mockKeySecret}`,
            capability: { '*': ['*'] },
            created: Date.now(),
            modified: Date.now(),
            status: 'enabled',
            revocable: true
          });
      })
      .command([
        'auth:keys:create',
        '--name', mockKeyName,
        '--app', mockAppId,
        '--access-token', 'custom_access_token'
      ])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('Key created successfully');
      });
  });

  describe('parameter validation', () => {
    test
      .command(['auth:keys:create', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('Missing required flag');
        expect(error.message).to.include('name');
      })
      .it('should require name parameter');

    test
      .command(['auth:keys:create', '--name', mockKeyName])
      .catch(error => {
        expect(error.message).to.include('app');
      })
      .it('should require app parameter when no current app is set');

    test
      .do(() => {
        // Mock the key creation endpoint with invalid capabilities
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(400, {
            error: 'Invalid capabilities format'
          });
      })
      .command([
        'auth:keys:create',
        '--name', mockKeyName,
        '--app', mockAppId,
        '--capabilities', 'invalid-json'
      ])
      .catch(error => {
        expect(error.message).to.include('Invalid capabilities');
      })
      .it('should handle invalid capabilities JSON');
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock not found response (app doesn't exist)
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(404, { error: 'App not found' });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .replyWithError('Network error');
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .do(() => {
        // Mock validation error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(400, {
            error: 'Validation failed',
            details: 'Key name already exists'
          });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('400');
      })
      .it('should handle validation errors from API');

    test
      .do(() => {
        // Mock rate limit error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`)
          .reply(429, { error: 'Rate limit exceeded' });
      })
      .command(['auth:keys:create', '--name', mockKeyName, '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('429');
      })
      .it('should handle rate limit errors');
  });

  describe('capability configurations', () => {
    test
      .stdout()
      .do(() => {
        // Mock the key creation endpoint with publish-only capabilities
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`, {
            name: mockKeyName,
            capability: { 'channel:*': ['publish'] }
          })
          .reply(201, {
            id: mockKeyId,
            appId: mockAppId,
            name: mockKeyName,
            key: `${mockAppId}.${mockKeyId}:${mockKeySecret}`,
            capability: { 'channel:*': ['publish'] },
            created: Date.now(),
            modified: Date.now(),
            status: 'enabled',
            revocable: true
          });
      })
      .command([
        'auth:keys:create',
        '--name', mockKeyName,
        '--app', mockAppId,
        '--capabilities', '{"channel:*":["publish"]}'
      ])
      .it('should create a publish-only key', ctx => {
        expect(ctx.stdout).to.include('Key created successfully');
        expect(ctx.stdout).to.include('publish');
      });

    test
      .stdout()
      .do(() => {
        // Mock the key creation endpoint with subscribe-only capabilities
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/keys`, {
            name: mockKeyName,
            capability: { 'channel:chat-*': ['subscribe'], 'channel:updates': ['publish'] }
          })
          .reply(201, {
            id: mockKeyId,
            appId: mockAppId,
            name: mockKeyName,
            key: `${mockAppId}.${mockKeyId}:${mockKeySecret}`,
            capability: { 'channel:chat-*': ['subscribe'], 'channel:updates': ['publish'] },
            created: Date.now(),
            modified: Date.now(),
            status: 'enabled',
            revocable: true
          });
      })
      .command([
        'auth:keys:create',
        '--name', mockKeyName,
        '--app', mockAppId,
        '--capabilities', '{"channel:chat-*":["subscribe"],"channel:updates":["publish"]}'
      ])
      .it('should create a key with mixed capabilities', ctx => {
        expect(ctx.stdout).to.include('Key created successfully');
        expect(ctx.stdout).to.include('chat-*');
        expect(ctx.stdout).to.include('subscribe');
        expect(ctx.stdout).to.include('updates');
      });
  });
});