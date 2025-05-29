import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('queues:list command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';

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

  describe('successful queue listing', () => {
    test
      .stdout()
      .do(() => {
        // Mock the queue listing endpoint with multiple queues
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
              id: 'queue-1',
              appId: mockAppId,
              name: 'test-queue-1',
              region: 'us-east-1-a',
              state: 'active',
              maxLength: 10000,
              ttl: 60,
              deadletter: false,
              deadletterId: '',
              messages: {
                ready: 5,
                total: 10,
                unacknowledged: 5
              },
              stats: {
                publishRate: 1.5,
                deliveryRate: 1.2,
                acknowledgementRate: 1.0
              },
              amqp: {
                uri: 'amqps://queue.ably.io:5671',
                queueName: 'test-queue-1'
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: '/queue/test-queue-1'
              }
            },
            {
              id: 'queue-2',
              appId: mockAppId,
              name: 'test-queue-2',
              region: 'eu-west-1-a',
              state: 'active',
              maxLength: 50000,
              ttl: 3600,
              deadletter: true,
              deadletterId: 'queue-2-dl',
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
                queueName: 'test-queue-2'
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: '/queue/test-queue-2'
              }
            }
          ]);
      })
      .command(['queues:list'])
      .it('should list multiple queues successfully', ctx => {
        expect(ctx.stdout).to.include('Found 2 queues');
        expect(ctx.stdout).to.include('Queue ID: queue-1');
        expect(ctx.stdout).to.include('Name: test-queue-1');
        expect(ctx.stdout).to.include('Region: us-east-1-a');
        expect(ctx.stdout).to.include('State: active');
        expect(ctx.stdout).to.include('AMQP:');
        expect(ctx.stdout).to.include('STOMP:');
        expect(ctx.stdout).to.include('Messages:');
        expect(ctx.stdout).to.include('Ready: 5');
        expect(ctx.stdout).to.include('Unacknowledged: 5');
        expect(ctx.stdout).to.include('Total: 10');
        expect(ctx.stdout).to.include('Stats:');
        expect(ctx.stdout).to.include('Publish Rate: 1.5 msg/s');
        expect(ctx.stdout).to.include('Delivery Rate: 1.2 msg/s');
        expect(ctx.stdout).to.include('Acknowledgement Rate: 1 msg/s');
        expect(ctx.stdout).to.include('TTL: 60 seconds');
        expect(ctx.stdout).to.include('Max Length: 10000 messages');
        
        // Check second queue
        expect(ctx.stdout).to.include('Queue ID: queue-2');
        expect(ctx.stdout).to.include('Name: test-queue-2');
        expect(ctx.stdout).to.include('Region: eu-west-1-a');
        expect(ctx.stdout).to.include('TTL: 3600 seconds');
        expect(ctx.stdout).to.include('Max Length: 50000 messages');
        expect(ctx.stdout).to.include('Deadletter Queue ID: queue-2-dl');
      });

    test
      .stdout()
      .do(() => {
        // Mock empty queue list
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, []);
      })
      .command(['queues:list'])
      .it('should handle empty queue list', ctx => {
        expect(ctx.stdout).to.include('No queues found');
      });

    test
      .stdout()
      .do(() => {
        const mockQueues = [
          {
            id: 'queue-1',
            appId: mockAppId,
            name: 'test-queue-1',
            region: 'us-east-1-a',
            state: 'active',
            maxLength: 10000,
            ttl: 60,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: 5,
              total: 10,
              unacknowledged: 5
            },
            stats: {
              publishRate: 1.5,
              deliveryRate: 1.2,
              acknowledgementRate: 1.0
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: 'test-queue-1'
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: '/queue/test-queue-1'
            }
          }
        ];

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, mockQueues);
      })
      .command(['queues:list', '--json'])
      .it('should output JSON format when --json flag is used', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('appId', mockAppId);
        expect(result).to.have.property('queues');
        expect(result.queues).to.be.an('array');
        expect(result.queues).to.have.length(1);
        expect(result.queues[0]).to.have.property('id', 'queue-1');
        expect(result.queues[0]).to.have.property('name', 'test-queue-1');
        expect(result).to.have.property('success', true);
        expect(result).to.have.property('total', 1);
      });

    test
      .stdout()
      .do(() => {
        const customAppId = 'custom-app-id';

        nock('https://control.ably.net')
          .get(`/v1/apps/${customAppId}/queues`)
          .reply(200, [
            {
              id: 'queue-1',
              appId: customAppId,
              name: 'test-queue-1',
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
                queueName: 'test-queue-1'
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: '/queue/test-queue-1'
              }
            }
          ]);
      })
      .command(['queues:list', '--app', 'custom-app-id'])
      .it('should use custom app ID when provided', ctx => {
        expect(ctx.stdout).to.include('Found 1 queues');
        expect(ctx.stdout).to.include('Queue ID: queue-1');
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
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, []);
      })
      .command(['queues:list', '--access-token', 'custom_access_token'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include('No queues found');
      });

    test
      .stdout()
      .do(() => {
        // Mock queue with no stats
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
              id: 'queue-1',
              appId: mockAppId,
              name: 'test-queue-1',
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
                queueName: 'test-queue-1'
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: '/queue/test-queue-1'
              }
            }
          ]);
      })
      .command(['queues:list'])
      .it('should handle queues with no stats gracefully', ctx => {
        expect(ctx.stdout).to.include('Found 1 queues');
        expect(ctx.stdout).to.include('Queue ID: queue-1');
        // Should not show stats section when all stats are null
        expect(ctx.stdout).to.not.include('Stats:');
      });
  });

  describe('error handling', () => {
    test
      .do(() => {
        // Mock authentication failure
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(401, { error: 'Unauthorized' });
      })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('401');
      })
      .it('should handle 401 authentication error');

    test
      .do(() => {
        // Mock forbidden response
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(403, { error: 'Forbidden' });
      })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock not found response
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(404, { error: 'App not found' });
      })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('404');
      })
      .it('should handle 404 app not found error');

    test
      .do(() => {
        // Mock server error
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .env({ ABLY_APP_ID: '' })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('No app specified');
      })
      .it('should require app to be specified when not in environment');

    test
      .do(() => {
        // Mock network error
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .replyWithError('Network error');
      })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .stdout()
      .do(() => {
        // Mock server error for JSON output
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['queues:list', '--json'])
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
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(429, { 
            error: 'Rate limit exceeded',
            details: 'Too many requests'
          });
      })
      .command(['queues:list'])
      .catch(error => {
        expect(error.message).to.include('429');
      })
      .it('should handle 429 rate limit error');
  });

  describe('large datasets and pagination', () => {
    test
      .stdout()
      .do(() => {
        // Mock a large number of queues to test performance
        const queues: any[] = [];
        for (let i = 1; i <= 50; i++) {
          queues.push({
            id: `queue-${i}`,
            appId: mockAppId,
            name: `test-queue-${i}`,
            region: 'us-east-1-a',
            state: 'active',
            maxLength: 10000,
            ttl: 60,
            deadletter: false,
            deadletterId: '',
            messages: {
              ready: i,
              total: i * 2,
              unacknowledged: i
            },
            stats: {
              publishRate: null,
              deliveryRate: null,
              acknowledgementRate: null
            },
            amqp: {
              uri: 'amqps://queue.ably.io:5671',
              queueName: `test-queue-${i}`
            },
            stomp: {
              uri: 'stomp://queue.ably.io:61614',
              host: 'queue.ably.io',
              destination: `/queue/test-queue-${i}`
            }
          });
        }

        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, queues);
      })
      .command(['queues:list'])
      .it('should handle large datasets correctly', ctx => {
        expect(ctx.stdout).to.include('Found 50 queues');
        expect(ctx.stdout).to.include('Queue ID: queue-1');
        expect(ctx.stdout).to.include('Queue ID: queue-50');
      });

    test
      .stdout()
      .do(() => {
        // Mock empty queue list for JSON output
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, []);
      })
      .command(['queues:list', '--json'])
      .it('should handle empty list in JSON format', ctx => {
        const result = JSON.parse(ctx.stdout);
        expect(result).to.have.property('appId', mockAppId);
        expect(result).to.have.property('queues');
        expect(result.queues).to.be.an('array');
        expect(result.queues).to.have.length(0);
        expect(result).to.have.property('success', true);
        expect(result).to.have.property('total', 0);
      });
  });
});