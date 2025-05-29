import { expect } from 'chai';
import nock from 'nock';
import { test } from '@oclif/test';
import { afterEach, beforeEach, describe, it } from 'mocha';

describe('queues:delete command', () => {
  const mockAccessToken = 'fake_access_token';
  const mockAppId = '550e8400-e29b-41d4-a716-446655440000';
  const mockQueueName = 'test-queue';
  const mockQueueId = 'queue-550e8400-e29b-41d4-a716-446655440000';

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

  describe('successful queue deletion', () => {
    test
      .stdout()
      .do(() => {
        // Mock the queue listing endpoint to find the queue
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
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
                ready: 5,
                total: 10,
                unacknowledged: 5
              },
              stats: {
                publishRate: null,
                deliveryRate: null,
                acknowledgementRate: null
              },
              amqp: {
                uri: 'amqps://queue.ably.io:5671',
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);

        // Mock the queue deletion endpoint
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}/queues/${mockQueueName}`)
          .reply(204);
      })
      .command(['queues:delete', mockQueueName, '--force'])
      .it('should delete a queue successfully with --force flag', ctx => {
        expect(ctx.stdout).to.include(`Queue "${mockQueueName}" deleted successfully`);
      });

    test
      .stdout()
      .do(() => {
        const customAppId = 'custom-app-id';

        // Mock the queue listing endpoint for custom app
        nock('https://control.ably.net')
          .get(`/v1/apps/${customAppId}/queues`)
          .reply(200, [
            {
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
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);

        // Mock the queue deletion endpoint for custom app
        nock('https://control.ably.net')
          .delete(`/v1/apps/${customAppId}/queues/${mockQueueName}`)
          .reply(204);
      })
      .command(['queues:delete', mockQueueName, '--app', 'custom-app-id', '--force'])
      .it('should delete a queue with custom app ID', ctx => {
        expect(ctx.stdout).to.include(`Queue "${mockQueueName}" deleted successfully`);
      });

    test
      .stdout()
      .do(() => {
        const customToken = 'custom_access_token';

        // Mock the queue listing endpoint with custom token
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
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
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);

        // Mock the queue deletion endpoint with custom token
        nock('https://control.ably.net', {
          reqheaders: {
            'authorization': `Bearer ${customToken}`
          }
        })
          .delete(`/v1/apps/${mockAppId}/queues/${mockQueueName}`)
          .reply(204);
      })
      .command(['queues:delete', mockQueueName, '--access-token', 'custom_access_token', '--force'])
      .it('should use custom access token when provided', ctx => {
        expect(ctx.stdout).to.include(`Queue "${mockQueueName}" deleted successfully`);
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
      .command(['queues:delete', mockQueueName, '--force'])
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
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include('403');
      })
      .it('should handle 403 forbidden error');

    test
      .do(() => {
        // Mock app not found response
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(404, { error: 'App not found' });
      })
      .command(['queues:delete', mockQueueName, '--force'])
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
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle 500 server error');

    test
      .do(() => {
        // Mock empty queue list (queue not found)
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, []);
      })
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include(`Queue "${mockQueueName}" not found`);
      })
      .it('should handle queue not found error');

    test
      .do(() => {
        // Mock finding the queue but deletion fails
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
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
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);

        // Mock deletion failure
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}/queues/${mockQueueName}`)
          .reply(500, { error: 'Internal Server Error' });
      })
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include('500');
      })
      .it('should handle deletion API error');

    test
      .command(['queues:delete'])
      .catch(error => {
        expect(error.message).to.include('Missing required argument');
      })
      .it('should require queue name argument');

    test
      .env({ ABLY_APP_ID: '' })
      .command(['queues:delete', mockQueueName, '--force'])
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
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include('Network error');
      })
      .it('should handle network errors');

    test
      .do(() => {
        // Mock queue with different name (not found case)
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
              id: mockQueueId,
              appId: mockAppId,
              name: 'different-queue-name',
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
                queueName: 'different-queue-name'
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: '/queue/different-queue-name'
              }
            }
          ]);
      })
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include(`Queue "${mockQueueName}" not found`);
      })
      .it('should handle when specific queue name is not found in list');

    test
      .do(() => {
        // Mock conflict error when queue is in use
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
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
                ready: 100,
                total: 200,
                unacknowledged: 100
              },
              stats: {
                publishRate: 5.0,
                deliveryRate: 4.5,
                acknowledgementRate: 4.0
              },
              amqp: {
                uri: 'amqps://queue.ably.io:5671',
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);

        // Mock conflict error
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}/queues/${mockQueueName}`)
          .reply(409, { 
            error: 'Conflict',
            details: 'Queue is currently in use'
          });
      })
      .command(['queues:delete', mockQueueName, '--force'])
      .catch(error => {
        expect(error.message).to.include('409');
      })
      .it('should handle 409 conflict error when queue is in use');
  });

  describe('confirmation prompt handling', () => {
    test
      .stdout()
      .do(() => {
        // Mock the queue listing endpoint
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
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
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);
      })
      .stdin('n\n')
      .command(['queues:delete', mockQueueName])
      .it('should cancel deletion when user responds no to confirmation', ctx => {
        expect(ctx.stdout).to.include('You are about to delete the following queue:');
        expect(ctx.stdout).to.include(`Queue ID: ${mockQueueId}`);
        expect(ctx.stdout).to.include(`Name: ${mockQueueName}`);
        expect(ctx.stdout).to.include('Region: us-east-1-a');
        expect(ctx.stdout).to.include('State: active');
        expect(ctx.stdout).to.include('Messages: 10 total (5 ready, 5 unacknowledged)');
        expect(ctx.stdout).to.include('Deletion cancelled');
      });

    test
      .stdout()
      .do(() => {
        // Mock the queue listing endpoint
        nock('https://control.ably.net')
          .get(`/v1/apps/${mockAppId}/queues`)
          .reply(200, [
            {
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
                queueName: mockQueueName
              },
              stomp: {
                uri: 'stomp://queue.ably.io:61614',
                host: 'queue.ably.io',
                destination: `/queue/${mockQueueName}`
              }
            }
          ]);

        // Mock the deletion endpoint
        nock('https://control.ably.net')
          .delete(`/v1/apps/${mockAppId}/queues/${mockQueueName}`)
          .reply(204);
      })
      .stdin('y\n')
      .command(['queues:delete', mockQueueName])
      .it('should proceed with deletion when user confirms', ctx => {
        expect(ctx.stdout).to.include('You are about to delete the following queue:');
        expect(ctx.stdout).to.include(`Queue "${mockQueueName}" deleted successfully`);
      });
  });
});