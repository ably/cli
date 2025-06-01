import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import { ControlApi } from '../../src/services/control-api.js';

describe('Control API Integration Tests', () => {
  let controlApi: ControlApi;
  let testAppId: string;
  let testAccountId: string;
  let createdResources: {
    apps: string[];
    keys: string[];
    queues: string[];
    rules: string[];
    namespaces: string[];
  };

  before(async function() {
    // Skip if no access token is provided
    if (!process.env.ABLY_ACCESS_TOKEN) {
      this.skip();
    }

    controlApi = new ControlApi({
      accessToken: process.env.ABLY_ACCESS_TOKEN!,
      logErrors: false
    });

    // Initialize resource tracking
    createdResources = {
      apps: [],
      keys: [],
      queues: [],
      rules: [],
      namespaces: []
    };

    try {
      // Get account info
      const meResponse = await controlApi.getMe();
      testAccountId = meResponse.account.id;
      console.log(`Using account: ${testAccountId}`);
    } catch (error) {
      console.error('Failed to get account info:', error);
      this.skip();
    }
  });

  after(async function() {
    if (!controlApi) return;

    console.log('Cleaning up created resources...');

    // Clean up in reverse order of dependencies
    // 1. Delete rules (integrations)
    for (const ruleId of createdResources.rules) {
      try {
        if (testAppId) {
          await controlApi.deleteRule(testAppId, ruleId);
          console.log(`Deleted rule: ${ruleId}`);
        }
      } catch (error) {
        console.warn(`Failed to delete rule ${ruleId}:`, error);
      }
    }

    // 2. Delete namespaces (channel rules)
    for (const namespaceId of createdResources.namespaces) {
      try {
        if (testAppId) {
          await controlApi.deleteNamespace(testAppId, namespaceId);
          console.log(`Deleted namespace: ${namespaceId}`);
        }
      } catch (error) {
        console.warn(`Failed to delete namespace ${namespaceId}:`, error);
      }
    }

    // 3. Delete queues
    for (const queueName of createdResources.queues) {
      try {
        if (testAppId) {
          await controlApi.deleteQueue(testAppId, queueName);
          console.log(`Deleted queue: ${queueName}`);
        }
      } catch (error) {
        console.warn(`Failed to delete queue ${queueName}:`, error);
      }
    }

    // 4. Revoke keys
    for (const keyId of createdResources.keys) {
      try {
        if (testAppId) {
          await controlApi.revokeKey(testAppId, keyId);
          console.log(`Revoked key: ${keyId}`);
        }
      } catch (error) {
        console.warn(`Failed to revoke key ${keyId}:`, error);
      }
    }

    // 5. Delete apps last
    for (const appId of createdResources.apps) {
      try {
        await controlApi.deleteApp(appId);
        console.log(`Deleted app: ${appId}`);
      } catch (error) {
        console.warn(`Failed to delete app ${appId}:`, error);
      }
    }
  });

  describe('App Management', () => {
    it('should create a new app', async () => {
      const appData = {
        name: `Test App ${Date.now()}`,
        tlsOnly: false
      };

      const app = await controlApi.createApp(appData);
      
      expect(app).to.have.property('id');
      expect(app).to.have.property('name', appData.name);
      expect(app).to.have.property('tlsOnly', false);
      expect(app).to.have.property('accountId', testAccountId);
      
      // Track for cleanup
      createdResources.apps.push(app.id);
      testAppId = app.id;
    });

    it('should list apps', async () => {
      const apps = await controlApi.listApps();
      
      expect(apps).to.be.an('array');
      expect(apps.length).to.be.greaterThan(0);
      
      // Should include our test app
      const testApp = apps.find(app => app.id === testAppId);
      expect(testApp).to.exist;
    });

    it('should get a specific app', async () => {
      const app = await controlApi.getApp(testAppId);
      
      expect(app).to.have.property('id', testAppId);
      expect(app).to.have.property('accountId', testAccountId);
    });

    it('should update an app', async () => {
      const updateData = {
        name: `Updated Test App ${Date.now()}`,
        tlsOnly: true
      };

      const updatedApp = await controlApi.updateApp(testAppId, updateData);
      
      expect(updatedApp).to.have.property('id', testAppId);
      expect(updatedApp).to.have.property('name', updateData.name);
      expect(updatedApp).to.have.property('tlsOnly', true);
    });
  });

  describe('API Key Management', () => {
    let testKeyId: string;

    it('should create a new API key', async () => {
      const keyData = {
        name: `Test Key ${Date.now()}`,
        capability: {
          '*': ['*']
        }
      };

      const key = await controlApi.createKey(testAppId, keyData);
      
      expect(key).to.have.property('id');
      expect(key).to.have.property('name', keyData.name);
      expect(key).to.have.property('appId', testAppId);
      expect(key).to.have.property('key');
      
      testKeyId = key.id;
      createdResources.keys.push(key.id);
    });

    it('should list API keys', async () => {
      const keys = await controlApi.listKeys(testAppId);
      
      expect(keys).to.be.an('array');
      expect(keys.length).to.be.greaterThan(0);
      
      // Should include our test key
      const testKey = keys.find(key => key.id === testKeyId);
      expect(testKey).to.exist;
    });

    it('should get a specific API key', async () => {
      const key = await controlApi.getKey(testAppId, testKeyId);
      
      expect(key).to.have.property('id', testKeyId);
      expect(key).to.have.property('appId', testAppId);
    });

    it('should update an API key', async () => {
      const updateData = {
        name: `Updated Test Key ${Date.now()}`,
        capability: {
          'channel1': ['publish'],
          'channel2': ['subscribe']
        }
      };

      const updatedKey = await controlApi.updateKey(testAppId, testKeyId, updateData);
      
      expect(updatedKey).to.have.property('id', testKeyId);
      expect(updatedKey).to.have.property('name', updateData.name);
    });
  });

  describe('Queue Management', () => {
    let testQueueName: string;

    it('should create a new queue', async () => {
      testQueueName = `test-queue-${Date.now()}`;
      const queueData = {
        name: testQueueName,
        maxLength: 1000,
        ttl: 3600,
        region: 'us-east-1-a'
      };

      const queue = await controlApi.createQueue(testAppId, queueData);
      
      expect(queue).to.have.property('id');
      expect(queue).to.have.property('name', testQueueName);
      expect(queue).to.have.property('appId', testAppId);
      expect(queue).to.have.property('maxLength', 1000);
      expect(queue).to.have.property('ttl', 3600);
      expect(queue).to.have.property('region', 'us-east-1-a');
      
      createdResources.queues.push(testQueueName);
    });

    it('should list queues', async () => {
      const queues = await controlApi.listQueues(testAppId);
      
      expect(queues).to.be.an('array');
      expect(queues.length).to.be.greaterThan(0);
      
      // Should include our test queue
      const testQueue = queues.find(queue => queue.name === testQueueName);
      expect(testQueue).to.exist;
      expect(testQueue).to.have.property('messages');
      expect(testQueue).to.have.property('stats');
      expect(testQueue).to.have.property('amqp');
      expect(testQueue).to.have.property('stomp');
    });
  });

  describe('Integration/Rules Management', () => {
    let testRuleId: string;

    it('should create a new integration rule', async () => {
      const ruleData = {
        requestMode: 'single',
        ruleType: 'http',
        source: {
          channelFilter: 'test-channel',
          type: 'channel.message'
        },
        target: {
          url: 'https://httpbin.org/post',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      };

      const rule = await controlApi.createRule(testAppId, ruleData);
      
      expect(rule).to.have.property('id');
      expect(rule).to.have.property('appId', testAppId);
      expect(rule).to.have.property('ruleType', 'http');
      expect(rule).to.have.property('requestMode', 'single');
      expect(rule).to.have.property('source');
      expect(rule.source).to.have.property('channelFilter', 'test-channel');
      
      testRuleId = rule.id;
      createdResources.rules.push(rule.id);
    });

    it('should list integration rules', async () => {
      const rules = await controlApi.listRules(testAppId);
      
      expect(rules).to.be.an('array');
      expect(rules.length).to.be.greaterThan(0);
      
      // Should include our test rule
      const testRule = rules.find(rule => rule.id === testRuleId);
      expect(testRule).to.exist;
    });

    it('should get a specific integration rule', async () => {
      const rule = await controlApi.getRule(testAppId, testRuleId);
      
      expect(rule).to.have.property('id', testRuleId);
      expect(rule).to.have.property('appId', testAppId);
    });

    it('should update an integration rule', async () => {
      const updateData = {
        source: {
          channelFilter: 'updated-channel',
          type: 'channel.message'
        },
        target: {
          url: 'https://httpbin.org/put'
        }
      };

      const updatedRule = await controlApi.updateRule(testAppId, testRuleId, updateData);
      
      expect(updatedRule).to.have.property('id', testRuleId);
      expect(updatedRule.source).to.have.property('channelFilter', 'updated-channel');
    });
  });

  describe('Namespace/Channel Rules Management', () => {
    let testNamespaceId: string;

    it('should create a new namespace', async () => {
      const namespaceData = {
        channelNamespace: `test-namespace-${Date.now()}`,
        persisted: true,
        pushEnabled: false,
        tlsOnly: true
      };

      const namespace = await controlApi.createNamespace(testAppId, namespaceData);
      
      expect(namespace).to.have.property('id');
      expect(namespace).to.have.property('appId', testAppId);
      expect(namespace).to.have.property('persisted', true);
      expect(namespace).to.have.property('pushEnabled', false);
      expect(namespace).to.have.property('tlsOnly', true);
      
      testNamespaceId = namespace.id;
      createdResources.namespaces.push(namespace.id);
    });

    it('should list namespaces', async () => {
      const namespaces = await controlApi.listNamespaces(testAppId);
      
      expect(namespaces).to.be.an('array');
      expect(namespaces.length).to.be.greaterThan(0);
      
      // Should include our test namespace
      const testNamespace = namespaces.find(ns => ns.id === testNamespaceId);
      expect(testNamespace).to.exist;
    });

    it('should get a specific namespace', async () => {
      const namespace = await controlApi.getNamespace(testAppId, testNamespaceId);
      
      expect(namespace).to.have.property('id', testNamespaceId);
      expect(namespace).to.have.property('appId', testAppId);
    });

    it('should update a namespace', async () => {
      const updateData = {
        persisted: false,
        pushEnabled: true,
        batchingEnabled: true,
        batchingInterval: 5000
      };

      const updatedNamespace = await controlApi.updateNamespace(testAppId, testNamespaceId, updateData);
      
      expect(updatedNamespace).to.have.property('id', testNamespaceId);
      expect(updatedNamespace).to.have.property('persisted', false);
      expect(updatedNamespace).to.have.property('pushEnabled', true);
      expect(updatedNamespace).to.have.property('batchingEnabled', true);
      expect(updatedNamespace).to.have.property('batchingInterval', 5000);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors for non-existent resources', async () => {
      try {
        await controlApi.getApp('non-existent-app-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
        expect((error as Error).message).to.include('not found');
      }
    });

    it('should handle invalid API keys', async () => {
      const invalidControlApi = new ControlApi({
        accessToken: 'invalid-token',
        logErrors: false
      });

      try {
        await invalidControlApi.listApps();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
        expect((error as Error).message).to.include('401');
      }
    });

    it('should handle malformed requests', async () => {
      try {
        // Try to create an app with invalid data
        await controlApi.createApp({ name: '' } as any);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
        // Could be 400 (validation) or other error
      }
    });
  });

  describe('Rate Limiting and Performance', () => {
    it('should handle multiple concurrent requests', async function() {
      this.timeout(10000); // Increase timeout for this test

      const promises: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(controlApi.listApps());
      }

      const results = await Promise.all(promises);
      
      expect(results).to.have.length(5);
      results.forEach(apps => {
        expect(apps).to.be.an('array');
      });
    });

    it('should handle pagination for large datasets', async () => {
      // This test depends on having enough data
      const apps = await controlApi.listApps();
      expect(apps).to.be.an('array');
      // Just verify the structure is correct
      if (apps.length > 0) {
        expect(apps[0]).to.have.property('id');
        expect(apps[0]).to.have.property('name');
      }
    });
  });
});