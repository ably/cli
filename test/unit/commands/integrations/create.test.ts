import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe } from 'mocha';

describe('integrations:create command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockRuleId = 'test-rule-id';

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  describe('successful integration creation', () => {
    test
      .stdout()
      .do(() => {
        // Mock the rule creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`, {
            requestMode: 'single',
            ruleType: 'http',
            source: {
              channelFilter: 'test-channel',
              type: 'channel.message'
            },
            target: {
              url: 'https://example.com/webhook',
              headers: {
                'Content-Type': 'application/json'
              }
            }
          })
          .reply(201, {
            id: mockRuleId,
            appId: mockAppId,
            requestMode: 'single',
            ruleType: 'http',
            source: {
              channelFilter: 'test-channel',
              type: 'channel.message'
            },
            target: {
              url: 'https://example.com/webhook',
              headers: {
                'Content-Type': 'application/json'
              }
            },
            version: 'v1.2',
            created: Date.now(),
            modified: Date.now()
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook'
      ])
      .it('should create an HTTP integration successfully', ctx => {
        expect(ctx.stdout).to.include('Integration created successfully');
        expect(ctx.stdout).to.include(mockRuleId);
        expect(ctx.stdout).to.include('test-channel');
      });

    test
      .stdout()
      .do(() => {
        // Mock AWS SQS integration creation
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`, {
            requestMode: 'single',
            ruleType: 'aws-sqs',
            source: {
              channelFilter: 'events.*',
              type: 'channel.message'
            },
            target: {
              queueName: 'test-queue',
              region: 'us-east-1',
              awsAccountId: '123456789012'
            }
          })
          .reply(201, {
            id: mockRuleId,
            appId: mockAppId,
            requestMode: 'single',
            ruleType: 'aws-sqs',
            source: {
              channelFilter: 'events.*',
              type: 'channel.message'
            },
            target: {
              queueName: 'test-queue',
              region: 'us-east-1',
              awsAccountId: '123456789012'
            },
            version: 'v1.2',
            created: Date.now(),
            modified: Date.now()
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'aws-sqs',
        '--channel-filter', 'events.*',
        '--source-type', 'channel.message',
        '--target-queue-name', 'test-queue',
        '--target-region', 'us-east-1',
        '--target-aws-account-id', '123456789012'
      ])
      .it('should create an AWS SQS integration successfully', ctx => {
        expect(ctx.stdout).to.include('Integration created successfully');
        expect(ctx.stdout).to.include('aws-sqs');
        expect(ctx.stdout).to.include('test-queue');
      });

    test
      .stdout()
      .do(() => {
        const mockRule = {
          id: mockRuleId,
          appId: mockAppId,
          requestMode: 'single',
          ruleType: 'http',
          source: {
            channelFilter: 'test-channel',
            type: 'channel.message'
          },
          target: {
            url: 'https://example.com/webhook'
          },
          version: 'v1.2',
          created: Date.now(),
          modified: Date.now()
        };

        // Mock the rule creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(201, mockRule);
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook',
        '--json'
      ])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('id', mockRuleId);
        expect(result).to.have.property('ruleType', 'http');
        expect(result).to.have.property('source');
      });

    test
      .stdout()
      .do(() => {
        const customToken = 'custom_access_token';

        // Mock the rule creation endpoint with custom token
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(201, {
            id: mockRuleId,
            appId: mockAppId,
            requestMode: 'single',
            ruleType: 'http',
            source: {
              channelFilter: 'test-channel',
              type: 'channel.message'
            },
            target: {
              url: 'https://example.com/webhook'
            },
            version: 'v1.2',
            created: Date.now(),
            modified: Date.now()
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook',
        '--access-token', 'custom_access_token'
      ])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('Integration created successfully');
      });
  });

  describe('parameter validation', () => {
    test
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--channel-filter', 'test-channel'
      ])
      .catch(error => {
        expect(error.message).to.include('rule-type');
      })
      .it('should require rule-type parameter');

    test
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http'
      ])
      .catch(error => {
        expect(error.message).to.include('channel-filter');
      })
      .it('should require channel-filter parameter');

    test
      .command([
        'integrations:create',
        '--rule-type', 'http',
        '--channel-filter', 'test-channel'
      ])
      .catch(error => {
        expect(error.message).to.include('app');
      })
      .it('should require app parameter when no current app is set');

    test
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message'
      ])
      .catch(error => {
        expect(error.message).to.include('target-url');
      })
      .it('should require target-url for HTTP integrations');

    test
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'aws-sqs',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message'
      ])
      .catch(error => {
        expect(error.message).to.include('target-queue-name');
      })
      .it('should require target-queue-name for AWS SQS integrations');
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook'
      ])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(403, { error: 'Forbidden' });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook'
      ])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock not found response (app doesn't exist)
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(404, { error: 'App not found' });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook'
      ])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook'
      ])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .do(() => {
        // Mock validation error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .reply(400, {
            error: 'Validation failed',
            details: 'Invalid target URL format'
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'invalid-url'
      ])
      .catch(error => {
        expect(error.message).to.include('400');
      })
      .it('should handle validation errors from API');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`)
          .replyWithError('Network error');
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'test-channel',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/webhook'
      ])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');
  });

  describe('different integration types', () => {
    test
      .stdout()
      .do(() => {
        // Mock Zapier integration creation
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`, {
            requestMode: 'single',
            ruleType: 'zapier',
            source: {
              channelFilter: 'notifications',
              type: 'channel.message'
            },
            target: {
              url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/'
            }
          })
          .reply(201, {
            id: mockRuleId,
            appId: mockAppId,
            requestMode: 'single',
            ruleType: 'zapier',
            source: {
              channelFilter: 'notifications',
              type: 'channel.message'
            },
            target: {
              url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/'
            },
            version: 'v1.2',
            created: Date.now(),
            modified: Date.now()
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'zapier',
        '--channel-filter', 'notifications',
        '--source-type', 'channel.message',
        '--target-url', 'https://hooks.zapier.com/hooks/catch/123456/abcdef/'
      ])
      .it('should create a Zapier integration', ctx => {
        expect(ctx.stdout).to.include('Integration created successfully');
        expect(ctx.stdout).to.include('zapier');
      });

    test
      .stdout()
      .do(() => {
        // Mock IFTTT integration creation
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`, {
            requestMode: 'single',
            ruleType: 'ifttt',
            source: {
              channelFilter: 'iot-sensors',
              type: 'channel.message'
            },
            target: {
              webhookKey: 'test-webhook-key',
              eventName: 'sensor_reading'
            }
          })
          .reply(201, {
            id: mockRuleId,
            appId: mockAppId,
            requestMode: 'single',
            ruleType: 'ifttt',
            source: {
              channelFilter: 'iot-sensors',
              type: 'channel.message'
            },
            target: {
              webhookKey: 'test-webhook-key',
              eventName: 'sensor_reading'
            },
            version: 'v1.2',
            created: Date.now(),
            modified: Date.now()
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'ifttt',
        '--channel-filter', 'iot-sensors',
        '--source-type', 'channel.message',
        '--target-webhook-key', 'test-webhook-key',
        '--target-event-name', 'sensor_reading'
      ])
      .it('should create an IFTTT integration', ctx => {
        expect(ctx.stdout).to.include('Integration created successfully');
        expect(ctx.stdout).to.include('ifttt');
        expect(ctx.stdout).to.include('sensor_reading');
      });
  });

  describe('request mode options', () => {
    test
      .stdout()
      .do(() => {
        // Mock batch request mode
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/rules`, {
            requestMode: 'batch',
            ruleType: 'http',
            source: {
              channelFilter: 'batch-events',
              type: 'channel.message'
            },
            target: {
              url: 'https://example.com/batch-webhook'
            }
          })
          .reply(201, {
            id: mockRuleId,
            appId: mockAppId,
            requestMode: 'batch',
            ruleType: 'http',
            source: {
              channelFilter: 'batch-events',
              type: 'channel.message'
            },
            target: {
              url: 'https://example.com/batch-webhook'
            },
            version: 'v1.2',
            created: Date.now(),
            modified: Date.now()
          });
      })
      .command([
        'integrations:create',
        '--app', mockAppId,
        '--rule-type', 'http',
        '--channel-filter', 'batch-events',
        '--source-type', 'channel.message',
        '--target-url', 'https://example.com/batch-webhook',
        '--request-mode', 'batch'
      ])
      .it('should create integration with batch request mode', ctx => {
        expect(ctx.stdout).to.include('Integration created successfully');
        expect(ctx.stdout).to.include('batch');
      });
  });
});