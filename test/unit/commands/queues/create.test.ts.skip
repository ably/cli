import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('queues:create command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAccountId = 'test-account-id';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockQueueName = 'test-queue';
  const mockQueueId = 'queue-550e8400-e29b-41d4-a716-446655440000';
  let testConfigDir: string;
  let originalConfigDir: string;

  beforeEach(() => {
    // Set environment variable for access token
    process.env.ABLY_ACCESS_TOKEN = mockAccessToken;
    
    // Create a temporary config directory for testing
    testConfigDir = path.join(os.tmpdir(), `ably-cli-test-${Date.now()}`);
    fs.mkdirSync(testConfigDir, { recursive: true, mode: 0o700 });
    
    // Store original config dir and set test config dir
    originalConfigDir = process.env.ABLY_CLI_CONFIG_DIR || '';
    process.env.ABLY_CLI_CONFIG_DIR = testConfigDir;
    
    // Create a minimal config file with a default account and current app
    const configContent = `[current]
account = "default"
currentAppId = "${mockAppId}"
appName = "Test App"

[accounts.default]
accessToken = "${mockAccessToken}"
accountId = "${mockAccountId}"
accountName = "Test Account"
userEmail = "test@example.com"
`;
    fs.writeFileSync(path.join(testConfigDir, 'config'), configContent);
  });

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
    delete process.env.ABLY_ACCESS_TOKEN;
    
    // Restore original config directory
    if (originalConfigDir) {
      process.env.ABLY_CLI_CONFIG_DIR = originalConfigDir;
    } else {
      delete process.env.ABLY_CLI_CONFIG_DIR;
    }
    
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('successful queue creation', () => {
    test
      .stdout()
      .do(() => {
        // Mock the queue creation endpoint
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`, {
            name: mockQueueName,
            maxLength: 10000,
            region: 'us-east-1-a',
            ttl: 60
          })
          .reply(201, {
            id: mockQueueId,
            appId: mockAppId,
            name: mockQueueName,
            region: 'us-east-1-a',
            state: 'active',
            maxLength: 10000,
            ttl: 60,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 0,
              total: 0,
              unacknowledged: 0
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue'
            }
          });
      })
      .command(['queues:create', '--name', mockQueueName])
      .it('should create a queue successfully with default settings', ctx => {
        expect(ctx.stdout).to.include('Queue created successfully');
        expect(ctx.stdout).to.include(`Queue ID: ${mockQueueId}`);
        expect(ctx.stdout).to.include(`Name: ${mockQueueName}`);
        expect(ctx.stdout).to.include('Region: us-east-1-a');
        expect(ctx.stdout).to.include('TTL: 60 seconds');
        expect(ctx.stdout).to.include('Max Length: 10000 messages');
        expect(ctx.stdout).to.include('AMQP Connection Details');
        expect(ctx.stdout).to.include('STOMP Connection Details');
      });

    test
      .stdout()
      .do(() => {
        // Mock the queue creation endpoint with custom settings
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`, {
            name: mockQueueName,
            maxLength: 50000,
            region: 'eu-west-1-a',
            ttl: 3600
          })
          .reply(201, {
            id: mockQueueId,
            appId: mockAppId,
            name: mockQueueName,
            region: 'eu-west-1-a',
            state: 'active',
            maxLength: 50000,
            ttl: 3600,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 0,
              total: 0,
              unacknowledged: 0
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue'
            }
          });
      })
      .command(['queues:create', '--name', mockQueueName, '--max-length', '50000', '--region', 'eu-west-1-a', '--ttl', '3600'])
      .it('should create a queue with custom settings', ctx => {
        expect(ctx.stdout).to.include('Queue created successfully');
        expect(ctx.stdout).to.include('Region: eu-west-1-a');
        expect(ctx.stdout).to.include('TTL: 3600 seconds');
        expect(ctx.stdout).to.include('Max Length: 50000 messages');
      });

    test
      .stdout()
      .do(() => {
        const mockQueue = {
          id: mockQueueId,
          appId: mockAppId,
          name: mockQueueName,
          region: 'us-east-1-a',
          state: 'active',
          maxLength: 10000,
          ttl: 60,
          deadletter: false,
          deadletterId: '',
          messages: {
            ready: 0,
            total: 0,
            unacknowledged: 0
          },
          stats: {
            publishRate: null,
            deliveryRate: null,
            acknowledgementRate: null
          },
          amqp: {
            uri: 'amqps://queue.ably.io:5671',
            queueName: 'test-queue'
          },
          stomp: {
            uri: 'stomp://queue.ably.io:61614',
            host: 'queue.ably.io',
            destination: '/queue/test-queue'
          }
        };

        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(201, mockQueue);
      })
      .command(['queues:create', '--name', mockQueueName, '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('id', mockQueueId);
        expect(result).to.have.property('name', mockQueueName);
        expect(result).to.have.property('region', 'us-east-1-a');
      });

    test
      .stdout()
      .do(() => {
        const customAppId = 'custom-app-id';

        // Mock the /me endpoint to get account info
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock the apps listing endpoint to find the custom app
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, [
            {
              id: customAppId,
              accountId: mockAccountId,
              name: 'Custom App',
              status: 'active',
              created: Date.now(),
              modified: Date.now(),
              tlsOnly: false
            }
          ]);

        nock('https://control.ably.net')
          .post(`/v1/apps/${customAppId}/queues`)
          .reply(201, {
            id: mockQueueId,
            appId: customAppId,
            name: mockQueueName,
            region: 'us-east-1-a',
            state: 'active',
            maxLength: 10000,
            ttl: 60,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 0,
              total: 0,
              unacknowledged: 0
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue'
            }
          });
      })
      .command(['queues:create', '--name', mockQueueName, '--app', 'custom-app-id'])
      .it('should use custom app ID when provided', ctx => {
        expect(ctx.stdout).to.include('Queue created successfully');
      });

    test
      .stdout()
      .do(() => {
        const customToken = 'custom_access_token';

        // Mock the /me endpoint to get account info (not called when using config app)
        // But the command should use the existing config app directly
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(201, {
            id: mockQueueId,
            appId: mockAppId,
            name: mockQueueName,
            region: 'us-east-1-a',
            state: 'active',
            maxLength: 10000,
            ttl: 60,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 0,
              total: 0,
              unacknowledged: 0
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue'
            }
          });
      })
      .command(['queues:create', '--name', mockQueueName, '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('Queue created successfully');
      });
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock not found response
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(404, { error: 'App not found' });
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 app not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .command(['queues:create'])
      .catch(error => {
        expect(error.message).to.include('Missing required flag');
        expect(error.message).to.include('name');
      })
      .it('should require name parameter');

    test
      .env({ ABLY_CLI_CONFIG_DIR: '' })
      .do(() => {
        // Mock the /me endpoint to get account info
        nock('https://control.ably.net')
          .get('/v1/me')
          .reply(200, {
            account: { id: mockAccountId, name: 'Test Account' },
            user: { email: 'test@example.com' }
          });

        // Mock empty apps list to trigger "no app specified" error
        nock('https://control.ably.net')
          .get(`/v1/accounts/${mockAccountId}/apps`)
          .reply(200, []);
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('No app specified');
      })
      .it('should require app to be specified when not in environment');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .replyWithError('Network error');
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .do(() => {
        // Mock validation error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(400, { 
            error: 'Validation failed',
            details: 'Queue name already exists'
          });
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('400');
      })
      .it('should handle validation errors from API');

    test
      .do(() => {
        // Mock quota exceeded error
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`)
          .reply(429, { 
            error: 'Rate limit exceeded',
            details: 'Too many requests'
          });
      })
      .command(['queues:create', '--name', mockQueueName])
      .catch(error => {
        expect(error.message).to.include('429');
      })
      .it('should handle 429 rate limit error');
  });

  describe('parameter validation', () => {
    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`, {
            name: mockQueueName,
            maxLength: 1,
            region: 'us-east-1-a',
            ttl: 1
          })
          .reply(201, {
            id: mockQueueId,
            appId: mockAppId,
            name: mockQueueName,
            region: 'us-east-1-a',
            state: 'active',
            maxLength: 1,
            ttl: 1,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 0,
              total: 0,
              unacknowledged: 0
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue'
            }
          });
      })
      .command(['queues:create', '--name', mockQueueName, '--max-length', '1', '--ttl', '1'])
      .it('should accept minimum valid parameter values', ctx => {
        expect(ctx.stdout).to.include('Queue created successfully');
        expect(ctx.stdout).to.include('TTL: 1 seconds');
        expect(ctx.stdout).to.include('Max Length: 1 messages');
      });

    test
      .stdout()
      .do(() => {
        nock('https://control.ably.net')
          .post(`/v1/apps/${mockAppId}/queues`, {
            name: mockQueueName,
            maxLength: 1000000,
            region: 'ap-southeast-2-a',
            ttl: 86400
          })
          .reply(201, {
            id: mockQueueId,
            appId: mockAppId,
            name: mockQueueName,
            region: 'ap-southeast-2-a',
            state: 'active',
            maxLength: 1000000,
            ttl: 86400,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 0,
              total: 0,
              unacknowledged: 0
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue'
            }
          });
      })
      .command(['queues:create', '--name', mockQueueName, '--max-length', '1000000', '--region', 'ap-southeast-2-a', '--ttl', '86400'])
      .it('should accept large parameter values and different regions', ctx => {
        expect(ctx.stdout).to.include('Queue created successfully');
        expect(ctx.stdout).to.include('Region: ap-southeast-2-a');
        expect(ctx.stdout).to.include('TTL: 86400 seconds');
        expect(ctx.stdout).to.include('Max Length: 1000000 messages');
      });
  });
});