import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('channel-rule:create command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockRuleName = 'test-rule';
  const mockNamespaceId = 'namespace-550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
    process.env.ABLY_APP_ID = mockAppId;
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
    delete process.env.ABLY_APP_ID;
  });

  describe('successful channel rule creation', () => {
    test
      .stdout()
      .do(() => {
        // Mock the namespace creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`, {
            channelNamespace: mockRuleName,
            persisted: false,
            pushEnabled: false,
            authenticated: undefined,
            batchingEnabled: undefined,
            batchingInterval: undefined,
            conflationEnabled: undefined,
            conflationInterval: undefined,
            conflationKey: undefined,
            exposeTimeSerial: undefined,
            persistLast: undefined,
            populateChannelRegistry: undefined,
            tlsOnly: undefined
          })
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: false,
            populateChannelRegistry: false,
            pushEnabled: false,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .it('should create a channel rule successfully with default settings', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
        expect(ctx.stdout).to.include(`ID: ${mockNamespaceId}`);
        expect(ctx.stdout).to.include('Persisted: No');
        expect(ctx.stdout).to.include('Push Enabled: No');
      });

    test
      .stdout()
      .do(() => {
        // Mock the namespace creation endpoint with persisted and push enabled
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`, {
            channelNamespace: mockRuleName,
            persisted: true,
            pushEnabled: true,
            authenticated: undefined,
            batchingEnabled: undefined,
            batchingInterval: undefined,
            conflationEnabled: undefined,
            conflationInterval: undefined,
            conflationKey: undefined,
            exposeTimeSerial: undefined,
            persistLast: undefined,
            populateChannelRegistry: undefined,
            tlsOnly: undefined
          })
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: true,
            populateChannelRegistry: false,
            pushEnabled: true,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', mockRuleName, '--persisted', '--push-enabled'])
      .it('should create a channel rule with persisted and push enabled', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
        expect(ctx.stdout).to.include('Persisted: Yes');
        expect(ctx.stdout).to.include('Push Enabled: Yes');
      });

    test
      .stdout()
      .do(() => {
        // Mock the namespace creation endpoint with all options
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`, {
            channelNamespace: mockRuleName,
            persisted: true,
            pushEnabled: true,
            authenticated: true,
            batchingEnabled: true,
            batchingInterval: 5000,
            conflationEnabled: true,
            conflationInterval: 1000,
            conflationKey: 'user_id',
            exposeTimeSerial: true,
            persistLast: true,
            populateChannelRegistry: true,
            tlsOnly: true
          })
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: true,
            batchingEnabled: true,
            batchingInterval: 5000,
            conflationEnabled: true,
            conflationInterval: 1000,
            conflationKey: 'user_id',
            created: Date.now(),
            exposeTimeSerial: true,
            modified: Date.now(),
            persistLast: true,
            persisted: true,
            populateChannelRegistry: true,
            pushEnabled: true,
            tlsOnly: true
          });
      })
      .command([
        'channel-rule:create',
        '--name', mockRuleName,
        '--persisted',
        '--push-enabled',
        '--authenticated',
        '--batching-enabled',
        '--batching-interval', '5000',
        '--conflation-enabled',
        '--conflation-interval', '1000',
        '--conflation-key', 'user_id',
        '--expose-time-serial',
        '--persist-last',
        '--populate-channel-registry',
        '--tls-only'
      ])
      .it('should create a channel rule with all options enabled', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
        expect(ctx.stdout).to.include('Persisted: Yes');
        expect(ctx.stdout).to.include('Push Enabled: Yes');
        expect(ctx.stdout).to.include('Authenticated: Yes');
        expect(ctx.stdout).to.include('Persist Last: Yes');
        expect(ctx.stdout).to.include('Expose Time Serial: Yes');
        expect(ctx.stdout).to.include('Populate Channel Registry: Yes');
        expect(ctx.stdout).to.include('Batching Enabled: Yes');
        expect(ctx.stdout).to.include('Batching Interval: 5000');
        expect(ctx.stdout).to.include('Conflation Enabled: Yes');
        expect(ctx.stdout).to.include('Conflation Interval: 1000');
        expect(ctx.stdout).to.include('Conflation Key: user_id');
        expect(ctx.stdout).to.include('TLS Only: Yes');
      });

    test
      .stdout()
      .do(() => {
        const mockNamespace = {
          id: mockNamespaceId,
          appId: mockAppId,
          authenticated: false,
          batchingEnabled: false,
          batchingInterval: 0,
          conflationEnabled: false,
          conflationInterval: 0,
          conflationKey: '',
          created: Date.now(),
          exposeTimeSerial: false,
          modified: Date.now(),
          persistLast: false,
          persisted: true,
          populateChannelRegistry: false,
          pushEnabled: false,
          tlsOnly: false
        };

        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(201, mockNamespace);
      })
      .command(['channel-rule:create', '--name', mockRuleName, '--persisted', '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('appId', mockAppId);
        expect(result).to.have.property('success', true);
        expect(result).to.have.property('rule');
        expect(result.rule).to.have.property('id', mockNamespaceId);
        expect(result.rule).to.have.property('name', mockRuleName);
        expect(result.rule).to.have.property('persisted', true);
        expect(result.rule).to.have.property('pushEnabled', false);
      });

    test
      .stdout()
      .do(() => {
        const customAppId = 'custom-app-id';

        nock('https://control.ably.net')
          .post(`/v1/apps/${customAppId}/namespaces`)
          .reply(201, {
            id: mockNamespaceId,
            appId: customAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: false,
            populateChannelRegistry: false,
            pushEnabled: false,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', mockRuleName, '--app', 'custom-app-id'])
      .it('should use custom app ID when provided', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
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
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: false,
            populateChannelRegistry: false,
            pushEnabled: false,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', mockRuleName, '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
      });
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock not found response
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(404, { error: 'App not found' });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 app not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .command(['channel-rule:create'])
      .catch(error => {
        expect(error.message).to.include('Missing required flag');
        expect(error.message).to.include('name');
      })
      .it('should require name parameter');

    test
      .env({ ABLY_APP_ID: '' })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('No app specified');
      })
      .it('should require app to be specified when not in environment');

    test
      .stdout()
      .env({ ABLY_APP_ID: '' })
      .command(['channel-rule:create', '--name', mockRuleName, '--json'])
      .it('should handle missing app error in JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('success', false);
        expect(result).to.have.property('status', 'error');
        expect(result).to.have.property('error');
        expect(result.error).to.include('No app specified');
      });

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .replyWithError('Network error');
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .do(() => {
        // Mock validation error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(400, { 
            error: 'Validation failed',
            details: 'Channel rule name already exists'
          });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('400');
      })
      .it('should handle validation errors from API');

    test
      .stdout()
      .do(() => {
        // Mock server error for JSON output
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['channel-rule:create', '--name', mockRuleName, '--json'])
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
          .post(`/v1/apps/${mockAppId}/namespaces`)
          .reply(409, { 
            error: 'Conflict',
            details: 'Channel rule with this name already exists'
          });
      })
      .command(['channel-rule:create', '--name', mockRuleName])
      .catch(error => {
        expect(error.message).to.include('409');
      })
      .it('should handle 409 conflict error when rule already exists');
  });

  describe('parameter validation', () => {
    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`, {
            channelNamespace: 'very-long-channel-rule-name-for-testing-purposes',
            persisted: false,
            pushEnabled: false,
            authenticated: undefined,
            batchingEnabled: undefined,
            batchingInterval: undefined,
            conflationEnabled: undefined,
            conflationInterval: undefined,
            conflationKey: undefined,
            exposeTimeSerial: undefined,
            persistLast: undefined,
            populateChannelRegistry: undefined,
            tlsOnly: undefined
          })
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: false,
            populateChannelRegistry: false,
            pushEnabled: false,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', 'very-long-channel-rule-name-for-testing-purposes'])
      .it('should accept long rule names', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
      });

    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`, {
            channelNamespace: 'a',
            persisted: false,
            pushEnabled: false,
            authenticated: undefined,
            batchingEnabled: undefined,
            batchingInterval: undefined,
            conflationEnabled: undefined,
            conflationInterval: undefined,
            conflationKey: undefined,
            exposeTimeSerial: undefined,
            persistLast: undefined,
            populateChannelRegistry: undefined,
            tlsOnly: undefined
          })
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: false,
            populateChannelRegistry: false,
            pushEnabled: false,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', 'a'])
      .it('should accept short rule names', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
      });

    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/namespaces`, {
            channelNamespace: 'rule-with-dashes',
            persisted: false,
            pushEnabled: false,
            authenticated: undefined,
            batchingEnabled: undefined,
            batchingInterval: undefined,
            conflationEnabled: undefined,
            conflationInterval: undefined,
            conflationKey: undefined,
            exposeTimeSerial: undefined,
            persistLast: undefined,
            populateChannelRegistry: undefined,
            tlsOnly: undefined
          })
          .reply(201, {
            id: mockNamespaceId,
            appId: mockAppId,
            authenticated: false,
            batchingEnabled: false,
            batchingInterval: 0,
            conflationEnabled: false,
            conflationInterval: 0,
            conflationKey: '',
            created: Date.now(),
            exposeTimeSerial: false,
            modified: Date.now(),
            persistLast: false,
            persisted: false,
            populateChannelRegistry: false,
            pushEnabled: false,
            tlsOnly: false
          });
      })
      .command(['channel-rule:create', '--name', 'rule-with-dashes'])
      .it('should accept rule names with special characters', ctx => {
        expect(ctx.stdout).to.include('Channel rule created successfully');
      });
  });
});