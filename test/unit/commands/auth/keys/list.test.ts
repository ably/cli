import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('auth:keys:list command', () => {
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

  describe('successful key listing', () => {
    test
      .stdout()
      .do(() => {
        const mockKeys = [
          {
            id: 'key-1',
            appId: mockAppId,
            name: 'Production Key',
            key: 'prod.key:secret',
            status: 'enabled',
            capability: {
              '*': ['*']
            },
            created: Date.now(),
            modified: Date.now()
          },
          {
            id: 'key-2',
            appId: mockAppId,
            name: 'Development Key',
            key: 'dev.key:secret',
            status: 'enabled',
            capability: {
              'test-*': ['publish', 'subscribe']
            },
            created: Date.now(),
            modified: Date.now()
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should list API keys successfully', ctx => {
        expect(ctx.stdout).to.include('API Keys for app');
        expect(ctx.stdout).to.include('Production Key');
        expect(ctx.stdout).to.include('Development Key');
        expect(ctx.stdout).to.include('key-1');
        expect(ctx.stdout).to.include('key-2');
        expect(ctx.stdout).to.include('Status: enabled');
      });

    test
      .stdout()
      .do(() => {
        const mockKeys = [
          {
            id: 'key-1',
            appId: mockAppId,
            name: 'Production Key',
            key: 'prod.key:secret',
            status: 'enabled',
            capability: {
              '*': ['*']
            },
            created: Date.now(),
            modified: Date.now()
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId, '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', true);
        expect(result).to.have.property('keys');
        expect(result.keys).to.be.an('array');
        expect(result.keys).to.have.length(1);
        expect(result.keys[0]).to.have.property('id', 'key-1');
        expect(result.keys[0]).to.have.property('name', 'Production Key');
        expect(result.keys[0]).to.have.property('status', 'enabled');
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
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, []);
      })
      .command(['auth:keys:list', '--app', mockAppId, '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('No API keys found');
      });

    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, []);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should handle empty key list', ctx => {
        expect(ctx.stdout).to.include('No API keys found');
      });
  });

  describe('capability display', () => {
    test
      .stdout()
      .do(() => {
        const mockKeys = [
          {
            id: 'key-1',
            appId: mockAppId,
            name: 'Restricted Key',
            key: 'restricted.key:secret',
            status: 'enabled',
            capability: {
              'channel1': ['publish'],
              'channel2': ['subscribe'],
              'private:*': ['publish', 'subscribe', 'presence']
            },
            created: Date.now(),
            modified: Date.now()
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should display detailed capability information', ctx => {
        expect(ctx.stdout).to.include('Restricted Key');
        expect(ctx.stdout).to.include('channel1: publish');
        expect(ctx.stdout).to.include('channel2: subscribe');
        expect(ctx.stdout).to.include('private:*: publish, subscribe, presence');
      });

    test
      .stdout()
      .do(() => {
        const mockKeys = [
          {
            id: 'key-1',
            appId: mockAppId,
            name: 'Full Access Key',
            key: 'full.key:secret',
            status: 'enabled',
            capability: {
              '*': ['*']
            },
            created: Date.now(),
            modified: Date.now()
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should display full access capability clearly', ctx => {
        expect(ctx.stdout).to.include('Full Access Key');
        expect(ctx.stdout).to.include('*: * (Full access)');
      });
  });

  describe('pagination and large datasets', () => {
    test
      .stdout()
      .do(() => {
        const mockKeys = Array.from({ length: 50 }, (_, i) => ({
          id: `key-${i + 1}`,
          appId: mockAppId,
          name: `API Key ${i + 1}`,
          key: `key${i + 1}.secret:value`,
          status: 'enabled',
          capability: {
            [`channel${i + 1}`]: ['publish', 'subscribe']
          },
          created: Date.now() - (i * 1000),
          modified: Date.now() - (i * 500)
        }));

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should handle large number of keys', ctx => {
        expect(ctx.stdout).to.include('API Keys for app');
        expect(ctx.stdout).to.include('API Key 1');
        expect(ctx.stdout).to.include('API Key 50');
        expect(ctx.stdout).to.include('key-1');
        expect(ctx.stdout).to.include('key-50');
      });

    test
      .stdout()
      .do(() => {
        const mockKeys = Array.from({ length: 100 }, (_, i) => ({
          id: `key-${i + 1}`,
          appId: mockAppId,
          name: `API Key ${i + 1}`,
          key: `key${i + 1}.secret:value`,
          status: i % 3 === 0 ? 'disabled' : 'enabled',
          capability: {
            [`channel${i + 1}`]: ['publish']
          },
          created: Date.now(),
          modified: Date.now()
        }));

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId, '--json'])
      .it('should handle very large datasets in JSON format', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('keys');
        expect(result.keys).to.have.length(100);
        expect(result.keys[0]).to.have.property('status', 'enabled');
        expect(result.keys[2]).to.have.property('status', 'disabled');
      });
  });

  describe('key status display', () => {
    test
      .stdout()
      .do(() => {
        const mockKeys = [
          {
            id: 'key-1',
            appId: mockAppId,
            name: 'Active Key',
            key: 'active.key:secret',
            status: 'enabled',
            capability: { '*': ['*'] },
            created: Date.now(),
            modified: Date.now()
          },
          {
            id: 'key-2',
            appId: mockAppId,
            name: 'Disabled Key',
            key: 'disabled.key:secret',
            status: 'disabled',
            capability: { '*': ['*'] },
            created: Date.now(),
            modified: Date.now()
          },
          {
            id: 'key-3',
            appId: mockAppId,
            name: 'Revoked Key',
            key: 'revoked.key:secret',
            status: 'revoked',
            capability: { '*': ['*'] },
            created: Date.now(),
            modified: Date.now()
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should display different key statuses correctly', ctx => {
        expect(ctx.stdout).to.include('Active Key');
        expect(ctx.stdout).to.include('Status: enabled');
        expect(ctx.stdout).to.include('Disabled Key');
        expect(ctx.stdout).to.include('Status: disabled');
        expect(ctx.stdout).to.include('Revoked Key');
        expect(ctx.stdout).to.include('Status: revoked');
      });
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock app not found
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(404, { error: 'App not found' });
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 app not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .replyWithError('Network error');
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .stdout()
      .do(() => {
        // Mock server error for JSON output
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['auth:keys:list', '--app', mockAppId, '--json'])
      .it('should handle errors in JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', false);
        expect(result).to.have.property('status', 'error');
        expect(result).to.have.property('error');
        expect(result).to.have.property('appId', mockAppId);
      });

    test
      .do(() => {
        // Mock rate limit error
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(429, { 
            error: 'Rate limit exceeded',
            retryAfter: 60
          });
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .catch(error => {
        expect(error.message).to.include('429');
      })
      .it('should handle 429 rate limit error');

    test
      .command(['auth:keys:list'])
      .catch(error => {
        expect(error.message).to.include('Missing required flag');
      })
      .it('should require app ID flag');
  });

  describe('date formatting', () => {
    test
      .stdout()
      .do(() => {
        const createdDate = new Date('2024-01-15T10:30:00Z').getTime();
        const modifiedDate = new Date('2024-01-20T15:45:00Z').getTime();

        const mockKeys = [
          {
            id: 'key-1',
            appId: mockAppId,
            name: 'Test Key',
            key: 'test.key:secret',
            status: 'enabled',
            capability: { '*': ['*'] },
            created: createdDate,
            modified: modifiedDate
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/keys`)
          .reply(200, mockKeys);
      })
      .command(['auth:keys:list', '--app', mockAppId])
      .it('should format creation and modification dates', ctx => {
        expect(ctx.stdout).to.include('Test Key');
        expect(ctx.stdout).to.include('Created:');
        expect(ctx.stdout).to.include('Modified:');
        // Should contain readable date format
        expect(ctx.stdout).to.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
      });
  });
});