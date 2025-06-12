import { expect } from 'chai';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { ControlApi } from '../../../src/services/control-api.js';
import { runBackgroundProcessAndGetOutput, forceExit, cleanupTrackedResources, testOutputFiles, testCommands, displayTestFailureDebugOutput } from '../../helpers/e2e-test-helper.js';
import { runCommand } from '../../helpers/command-helpers.js';

describe('Control API E2E Workflow Tests', () => {
  
  let controlApi: ControlApi;
  let testAccountId: string;
  let cliPath: string;
  let createdResources: {
    apps: string[];
    keys: string[];
    queues: string[];
    rules: string[];
    namespaces: string[];
  };

  before(async function() {
    // Skip if no access token is provided
    if (!process.env.E2E_ABLY_ACCESS_TOKEN) {
      this.skip();
    }
    process.on('SIGINT', forceExit);

    // Set up CLI path and API client
    cliPath = './bin/run.js';
    controlApi = new ControlApi({
      accessToken: process.env.E2E_ABLY_ACCESS_TOKEN!,
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
      console.log(`Running E2E tests for account: ${testAccountId}`);
    } catch (error) {
      console.error('Failed to get account info:', error);
      this.skip();
    }
  });

  after(async function() {
    if (!controlApi) return;

    console.log('Cleaning up E2E test resources...');

    // Clean up in reverse order of dependencies
    // 1. Delete rules (integrations)
    for (const ruleId of createdResources.rules) {
      try {
        const appId = createdResources.apps[0]; // Use first app
        if (appId) {
          await controlApi.deleteRule(appId, ruleId);
          console.log(`Deleted rule: ${ruleId}`);
        }
      } catch (error) {
        console.warn(`Failed to delete rule ${ruleId}:`, error);
      }
    }

    // 2. Delete namespaces (channel rules)
    for (const namespaceId of createdResources.namespaces) {
      try {
        const appId = createdResources.apps[0];
        if (appId) {
          await controlApi.deleteNamespace(appId, namespaceId);
          console.log(`Deleted namespace: ${namespaceId}`);
        }
      } catch (error) {
        console.warn(`Failed to delete namespace ${namespaceId}:`, error);
      }
    }

    // 3. Delete queues
    for (const queueName of createdResources.queues) {
      try {
        const appId = createdResources.apps[0];
        if (appId) {
          await controlApi.deleteQueue(appId, queueName);
          console.log(`Deleted queue: ${queueName}`);
        }
      } catch (error) {
        console.warn(`Failed to delete queue ${queueName}:`, error);
      }
    }

    // 4. Revoke keys
    for (const keyId of createdResources.keys) {
      try {
        const appId = createdResources.apps[0];
        if (appId) {
          await controlApi.revokeKey(appId, keyId);
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
    process.removeListener('SIGINT', forceExit);
  });

  beforeEach(function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked output files and commands for this test
    testOutputFiles.clear();
    testCommands.length = 0;
  });

  afterEach(async function() {
    if (this.currentTest?.state === 'failed') {
      await displayTestFailureDebugOutput(this.currentTest?.title);
    }
    await cleanupTrackedResources();
  });

  describe('Complete App Lifecycle Workflow', () => {
    it('should create, update, and manage an app through CLI', async function() {
      this.timeout(30000);

      const appName = `E2E Test App ${Date.now()}`;
      
      // 1. Create app
      const createResult = await runBackgroundProcessAndGetOutput(
        `ABLY_ACCESS_TOKEN=${process.env.E2E_ABLY_ACCESS_TOKEN} ${cliPath} apps create --name "${appName}" --json`,
        30000
      );
      
      expect(createResult.exitCode).to.equal(0);
      const createOutput = JSON.parse(createResult.stdout);
      expect(createOutput).to.have.property('app');
      expect(createOutput.app).to.have.property('id');
      expect(createOutput.app).to.have.property('name', appName);
      
      const appId = createOutput.app.id;
      createdResources.apps.push(appId);

      // 2. List apps and verify our app is included
      const listResult = await runBackgroundProcessAndGetOutput(
        `ABLY_ACCESS_TOKEN=${process.env.E2E_ABLY_ACCESS_TOKEN} ${cliPath} apps list --json`,
        30000
      );
      
      expect(listResult.exitCode).to.equal(0);
      const listOutput = JSON.parse(listResult.stdout);
      expect(listOutput).to.have.property('apps');
      expect(listOutput.apps).to.be.an('array');
      
      const foundApp = listOutput.apps.find((app: any) => app.id === appId);
      expect(foundApp).to.exist;

      // 3. Update app
      const updatedName = `Updated ${appName}`;
      const updateResult = await runCommand(["apps", "update", appId, "--name", updatedName, "--tls-only", "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      expect(updateResult.stderr).to.be.empty;
      const updateOutput = JSON.parse(updateResult.stdout);
      expect(updateOutput).to.have.property('app');
      expect(updateOutput.app).to.have.property('name', updatedName);
      expect(updateOutput.app).to.have.property('tlsOnly', true);
    });
  });

  describe('API Key Management Workflow', () => {
    let testAppId: string;

    before(async function() {
      // Create a test app first
      const appName = `E2E Key Test App ${Date.now()}`;
      const createResult = await runCommand(["apps", "create", "--name", appName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      testAppId = result.app.id;
    });

    after(async function() {
      // Clean up test app if created
      if (testAppId) {
        try {
          await runCommand(["apps", "delete", testAppId, "--force"], {
            env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
          });
        } catch (error) {
          console.log('Error cleaning up test app:', error);
        }
      }
    });

    it('should create a new API key', async function() {
      const keyName = `Test Key ${Date.now()}`;
      const createResult = await runCommand(["auth", "keys", "create", "--app", testAppId, "--name", keyName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      expect(result).to.have.property('success', true);
      expect(result.key).to.have.property('name', keyName);
      expect(result.key).to.have.property('key');
    });

    it('should list API keys', async function() {
      const listResult = await runCommand(["auth", "keys", "list", "--app", testAppId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(listResult.stdout);
      expect(result).to.have.property('success', true);
      expect(result.keys).to.be.an('array');
      expect(result.keys.length).to.be.greaterThan(0);
    });
  });

  describe('Queue Management Workflow', () => {
    let testAppId: string;

    before(async function() {
      // Create a test app first
      const appName = `E2E Queue Test App ${Date.now()}`;
      const createResult = await runCommand(["apps", "create", "--name", appName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      testAppId = result.app.id;
    });

    after(async function() {
      // Clean up test app if created
      if (testAppId) {
        try {
          await runCommand(["apps", "delete", testAppId, "--force"], {
            env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
          });
        } catch (error) {
          console.log('Error cleaning up test app:', error);
        }
      }
    });

    it('should create a new queue', async function() {
      const queueName = `test-queue-${Date.now()}`;
      const createResult = await runCommand(["queues", "create", "--app", testAppId, "--name", queueName, "--max-length", "5000", "--ttl", "1800", "--region", "eu-west-1-a", "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      expect(result).to.have.property('success', true);
      expect(result.queue).to.have.property('name', queueName);
      expect(result.queue).to.have.property('maxLength', 5000);
      expect(result.queue).to.have.property('ttl', 1800);
    });

    it('should list queues', async function() {
      const listResult = await runCommand(["queues", "list", "--app", testAppId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(listResult.stdout);
      expect(result).to.have.property('success', true);
      expect(result.queues).to.be.an('array');
    });

    it('should delete a queue', async function() {
      const queueName = `test-delete-queue-${Date.now()}`;
      // First create a queue
      await runCommand(["queues", "create", "--app", testAppId, "--name", queueName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });

      const deleteResult = await runCommand(["queues", "delete", queueName, "--app", testAppId, "--force"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      expect(deleteResult.stderr).to.be.empty;
      expect(deleteResult.stdout).to.include('deleted successfully');
      
      // Remove from cleanup list since we deleted it
      const index = createdResources.queues.indexOf(queueName);
      if (index !== -1) {
        createdResources.queues.splice(index, 1);
      }
    });
  });

  describe('Integration Rules Workflow', () => {
    let testAppId: string;

    before(async function() {
      // Create a test app first
      const appName = `E2E Integration Test App ${Date.now()}`;
      const createResult = await runCommand(["apps", "create", "--name", appName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      testAppId = result.app.id;
    });

    after(async function() {
      // Clean up test app if created
      if (testAppId) {
        try {
          await runCommand(["apps", "delete", testAppId, "--force"], {
            env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
          });
        } catch (error) {
          console.log('Error cleaning up test app:', error);
        }
      }
    });

    it('should create a new integration rule', async function() {
      const createResult = await runCommand(["integrations", "create", "--app", testAppId, "--rule-type", "http", "--channel-filter", "e2e-test-*", "--source-type", "channel.message", "--target-url", "https://httpbin.org/post", "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      expect(result).to.have.property('success', true);
      expect(result.rule).to.have.property('ruleType', 'http');
      expect(result.rule).to.have.property('source');
      expect(result.rule.source).to.have.property('channelFilter', 'e2e-test-*');
    });

    it('should list integration rules', async function() {
      const listResult = await runCommand(["integrations", "list", "--app", testAppId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(listResult.stdout);
      expect(result).to.have.property('success', true);
      expect(result.rules).to.be.an('array');
      expect(result.rules.length).to.be.greaterThan(0);
    });
  });

  describe('Channel Rules Workflow', () => {
    let testAppId: string;

    before(async function() {
      // Create a test app first
      const appName = `E2E Channel Rules Test App ${Date.now()}`;
      const createResult = await runCommand(["apps", "create", "--name", appName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const result = JSON.parse(createResult.stdout);
      testAppId = result.app.id;
    });

    after(async function() {
      // Clean up test app if created
      if (testAppId) {
        try {
          await runCommand(["apps", "delete", testAppId, "--force"], {
            env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
          });
        } catch (error) {
          console.log('Error cleaning up test app:', error);
        }
      }
    });

    it('should create and manage channel rules through CLI', async function() {
      this.timeout(20000);

      const ruleName = `e2e-channel-rule-${Date.now()}`;
      
      // 1. Create channel rule
      const createResult = await runCommand(["channel-rule", "create", "--app", testAppId, "--name", ruleName, "--persisted", "--push-enabled", "--authenticated", "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      expect(createResult.stderr).to.be.empty;
      const createOutput = JSON.parse(createResult.stdout);
      expect(createOutput).to.have.property('rule');
      expect(createOutput.rule).to.have.property('id');
      expect(createOutput.rule).to.have.property('name', ruleName);
      expect(createOutput.rule).to.have.property('persisted', true);
      expect(createOutput.rule).to.have.property('pushEnabled', true);
      expect(createOutput.rule).to.have.property('authenticated', true);
      
      const namespaceId = createOutput.rule.id;
      createdResources.namespaces.push(namespaceId);

      // 2. List channel rules and verify our rule is included
      const listResult = await runCommand(["channel-rule", "list", "--app", testAppId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      expect(listResult.stderr).to.be.empty;
      const listOutput = JSON.parse(listResult.stdout);
      expect(listOutput).to.have.property('namespaces');
      expect(listOutput.namespaces).to.be.an('array');
      
      const foundRule = listOutput.namespaces.find((ns: any) => ns.id === namespaceId);
      expect(foundRule).to.exist;
      expect(foundRule).to.have.property('persisted', true);
      expect(foundRule).to.have.property('pushEnabled', true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid access tokens gracefully', async function() {
      this.timeout(10000);

      try {
        const _result = await runCommand(["apps", "list", "--json"], {
          env: { ...process.env, ABLY_ACCESS_TOKEN: 'invalid-token' }
        });
        
        // Should fail with authentication error
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).to.not.equal(0);
        expect(error.stderr || error.stdout).to.include('401');
      }
    });

    it('should handle non-existent resources', async function() {
      this.timeout(10000);

      try {
        const _result = await runCommand(["apps", "update", "non-existent-app-id", "--name", "Test", "--json"], {
          env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
        });
        
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).to.not.equal(0);
        expect(error.stderr || error.stdout).to.include('404');
      }
    });

    it('should validate required parameters', async function() {
      this.timeout(10000);

      try {
        const _result = await runCommand(["apps", "create"], {
          env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
        });
        
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).to.not.equal(0);
        expect(error.stderr || error.stdout).to.include('Missing required flag');
      }
    });
  });

  describe('Cross-Command Workflows', () => {
    it('should handle complete app setup workflow', async function() {
      this.timeout(45000);

      const timestamp = Date.now();
      const appName = `E2E Complete Workflow ${timestamp}`;
      const keyName = `E2E Workflow Key ${timestamp}`;
      const queueName = `e2e-workflow-queue-${timestamp}`;
      
      // 1. Create app
      const createAppResult = await runCommand(["apps", "create", "--name", appName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const appOutput = JSON.parse(createAppResult.stdout);
      const appId = appOutput.app.id;
      createdResources.apps.push(appId);

      // 2. Create API key
      const createKeyResult = await runCommand(["auth", "keys", "create", "--app", appId, "--name", keyName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const keyOutput = JSON.parse(createKeyResult.stdout);
      const keyId = keyOutput.key.id;
      createdResources.keys.push(keyId);

      // 3. Create queue
      const createQueueResult = await runCommand(["queues", "create", "--app", appId, "--name", queueName, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const queueOutput = JSON.parse(createQueueResult.stdout);
      expect(queueOutput).to.have.property('name', queueName);
      createdResources.queues.push(queueName);

      // 4. Create integration
      const createIntegrationResult = await runCommand(["integrations", "create", "--app", appId, "--rule-type", "http", "--channel-filter", "workflow-test", "--source-type", "channel.message", "--target-url", "https://httpbin.org/post", "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const integrationOutput = JSON.parse(createIntegrationResult.stdout);
      const ruleId = integrationOutput.id;
      createdResources.rules.push(ruleId);

      // 5. Verify all resources exist by listing them
      const listAppsResult = await runCommand(["apps", "list", "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const appsOutput = JSON.parse(listAppsResult.stdout);
      expect(appsOutput.apps.find((app: any) => app.id === appId)).to.exist;

      const listKeysResult = await runCommand(["auth", "keys", "list", "--app", appId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const keysOutput = JSON.parse(listKeysResult.stdout);
      expect(keysOutput.keys.find((key: any) => key.id === keyId)).to.exist;

      const listQueuesResult = await runCommand(["queues", "list", "--app", appId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const queuesOutput = JSON.parse(listQueuesResult.stdout);
      expect(queuesOutput.queues.find((queue: any) => queue.name === queueName)).to.exist;

      const listIntegrationsResult = await runCommand(["integrations", "list", "--app", appId, "--json"], {
        env: { ABLY_ACCESS_TOKEN: process.env.E2E_ABLY_ACCESS_TOKEN }
      });
      
      const integrationsOutput = JSON.parse(listIntegrationsResult.stdout);
      expect(integrationsOutput.rules.find((rule: any) => rule.id === ruleId)).to.exist;
    });
  });
});