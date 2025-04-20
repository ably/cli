import { expect } from "chai";
import nock from "nock";
import { ControlApi } from "../../../src/services/control-api.js";

describe("ControlApi", function() {
  const accessToken = "test-access-token";
  const controlHost = "control.ably.test";
  let api: ControlApi;

  beforeEach(function() {
    // Create fresh instance for each test
    api = new ControlApi({ accessToken, controlHost, logErrors: false });

    // Ensure all nock interceptors are cleared
    nock.cleanAll();
  });

  afterEach(function() {
    // Ensure no pending nock mocks
    nock.cleanAll();
  });

  describe("#constructor", function() {
    it("should use provided control host", function() {
      const customApi = new ControlApi({
        accessToken,
        controlHost: "custom.control.host",
        logErrors: false,
      });

      // Set up nock to intercept request to custom host
      const scope = nock("https://custom.control.host")
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      // Make request to verify host
      return customApi.getMe().then(() => {
        expect(scope.isDone()).to.be.true;
      });
    });

    it("should use default control host if not provided", function() {
      const defaultApi = new ControlApi({ accessToken, logErrors: false });

      // Set up nock to intercept request to default host
      const scope = nock("https://control.ably.net")
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      // Make request to verify host
      return defaultApi.getMe().then(() => {
        expect(scope.isDone()).to.be.true;
      });
    });
  });

  describe("#listApps", function() {
    it("should fetch list of apps", async function() {
      const accountId = "test-account-id";
      const expectedApps = [
        { id: "app1", name: "Test App 1" },
        { id: "app2", name: "Test App 2" },
      ];

      // First set up the getMe interceptor
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId, name: "Test Account" }, user: { email: "test@example.com" } });

      // Then set up the listApps interceptor with the correct path
      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/apps`)
        .reply(200, expectedApps);

      const apps = await api.listApps();

      expect(apps).to.deep.equal(expectedApps);
    });

    it("should handle empty app list", async function() {
      const accountId = "test-account-id";

      // First set up the getMe interceptor
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId, name: "Test Account" }, user: { email: "test@example.com" } });

      // Then set up the listApps interceptor with the correct path
      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/apps`)
        .reply(200, []);

      const apps = await api.listApps();

      expect(apps).to.be.an("array").that.is.empty;
    });

    it("should handle error response", async function() {
      const accountId = "test-account-id";

      // First set up the getMe interceptor
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId, name: "Test Account" }, user: { email: "test@example.com" } });

      // Then set up the listApps interceptor with the correct path and error response
      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/apps`)
        .reply(401, { message: "Unauthorized" });

      try {
        await api.listApps();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Unauthorized");
      }
    });
  });

  describe("#createApp", function() {
    it("should create an app", async function() {
      const appData = { name: "New Test App" };
      const expectedApp = { id: "new-app-id", name: "New Test App" };
      const accountId = "test-account-id";

      // Set up nock to intercept getMe request
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId } });

      // Set up nock to intercept createApp request
      nock(`https://${controlHost}`)
        .post(`/v1/accounts/${accountId}/apps`, appData)
        .reply(201, expectedApp);

      const app = await api.createApp(appData);

      expect(app).to.deep.equal(expectedApp);
    });

    it("should handle error when creating app", async function() {
      const appData = { name: "Invalid App" };
      const accountId = "test-account-id";

      // Set up nock to intercept getMe request
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId } });

      // Set up nock to intercept createApp request with error
      nock(`https://${controlHost}`)
        .post(`/v1/accounts/${accountId}/apps`, appData)
        .reply(400, { message: "Invalid app name" });

      try {
        await api.createApp(appData);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Invalid app name");
      }
    });
  });

  describe("#updateApp", function() {
    it("should update an app", async function() {
      const appId = "test-app-id";
      const updateData = { name: "Updated App Name" };
      const expectedApp = { id: appId, name: "Updated App Name" };

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .patch(`/v1/apps/${appId}`, updateData)
        .reply(200, expectedApp);

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      const app = await api.updateApp(appId, updateData);

      expect(app).to.deep.equal(expectedApp);
    });
  });

  describe("#deleteApp", function() {
    it("should delete an app", async function() {
      const appId = "test-app-id";

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}`)
        .reply(204);

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      await api.deleteApp(appId);
      // No assertion needed as the test would fail if the promise was rejected
    });
  });

  describe("#getApp", function() {
    it("should get an app by ID", async function() {
      const accountId = "test-account-id";
      const appId = "test-app-id";
      const expectedApp = { id: appId, name: "Test App" };
      const allApps = [
        expectedApp,
        { id: "other-app", name: "Other App" }
      ];

      // First set up the getMe interceptor
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId, name: "Test Account" }, user: { email: "test@example.com" } });

      // Set up nock for listApps since getApp uses that internally
      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/apps`)
        .reply(200, allApps);

      const app = await api.getApp(appId);

      expect(app).to.deep.equal(expectedApp);
    });

    it("should throw error if app not found", async function() {
      const accountId = "test-account-id";
      const appId = "non-existent-app";
      const allApps = [
        { id: "other-app", name: "Other App" }
      ];

      // First set up the getMe interceptor
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId, name: "Test Account" }, user: { email: "test@example.com" } });

      // Set up nock for listApps with apps that don't include our target
      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/apps`)
        .reply(200, allApps);

      try {
        await api.getApp(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("not found");
      }
    });
  });

  describe("#getMe", function() {
    it("should get user and account info", async function() {
      const expectedResponse = {
        user: { id: "user-id", email: "test@example.com" },
        account: { id: "account-id", name: "Test Account" },
      };

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, expectedResponse);

      const info = await api.getMe();

      expect(info).to.deep.equal(expectedResponse);
    });
  });

  describe("API key operations", function() {
    it("should list API keys for an app", async function() {
      const appId = "test-app-id";
      const expectedKeys = [
        { id: "key1", name: "Test Key 1" },
        { id: "key2", name: "Test Key 2" },
      ];

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(200, expectedKeys);

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      const keys = await api.listKeys(appId);

      expect(keys).to.deep.equal(expectedKeys);
    });

    it("should create an API key", async function() {
      const appId = "test-app-id";
      const keyData = {
        name: "New Key",
        capabilities: { "channel:*": ["publish", "subscribe"] },
      };
      const expectedKey = {
        id: "new-key-id",
        name: "New Key",
        key: "appId.keyId:secret",
      };

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .post(`/v1/apps/${appId}/keys`, keyData)
        .reply(201, expectedKey);

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      const key = await api.createKey(appId, keyData);

      expect(key).to.deep.equal(expectedKey);
    });

    it("should handle error when creating API key", async function() {
      const appId = "test-app-id";
      const keyData = {
        name: "New Key",
        capabilities: { "channel:*": ["publish", "subscribe"] },
      };

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .post(`/v1/apps/${appId}/keys`, keyData)
        .reply(400, { message: "Bad Request" });

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      try {
        await api.createKey(appId, keyData);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Bad Request");
      }
    });

    it("should handle error when listing API keys", async function() {
      const appId = "test-app-id";

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(404, { message: "Key not found" });

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Key not found");
      }
    });

    it("should handle error when revoking API key", async function() {
      const appId = "test-app-id";
      const keyId = "test-key-id";

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}/keys/${keyId}`)
        .reply(500, { message: "Failed to revoke key" });

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      try {
        await api.revokeKey(appId, keyId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Failed to revoke key");
      }
    });

    it("should handle error when updating API key", async function() {
      const appId = "test-app-id";
      const keyId = "test-key-id";
      const updateData = {
        name: "Updated Key Name",
        capabilities: { "channel:*": ["publish", "subscribe"] },
      };

      // Set up nock to intercept request
      nock(`https://${controlHost}`)
        .patch(`/v1/apps/${appId}/keys/${keyId}`, updateData)
        .reply(500, { message: "Failed to update key" });

      // Intercept any calls to /me
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account-id" } });

      try {
        await api.updateKey(appId, keyId, updateData);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Failed to update key");
      }
    });
  });
});
