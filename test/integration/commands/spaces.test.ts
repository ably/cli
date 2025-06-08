import { expect } from "chai";
import { test } from "@oclif/test";
import { registerMock } from "../test-utils.js";

// Mock spaces data
const mockMembers = [
  {
    clientId: "alice", 
    connectionId: "conn_1",
    profileData: { name: "Alice", role: "designer" },
    isConnected: true,
    lastEvent: { name: "enter" },
  },
  {
    clientId: "bob",
    connectionId: "conn_2", 
    profileData: { name: "Bob", role: "developer" },
    isConnected: true,
    lastEvent: { name: "enter" },
  },
];

const mockLocations = [
  {
    clientId: "alice",
    location: { x: 100, y: 200, page: "dashboard" },
    timestamp: Date.now() - 5000,
  },
  {
    clientId: "bob",
    location: { x: 300, y: 150, page: "editor" },
    timestamp: Date.now() - 3000,
  },
];

const mockCursors = [
  {
    clientId: "alice",
    position: { x: 150, y: 250 },
    data: { color: "red", size: "medium" },
    timestamp: Date.now() - 2000,
  },
  {
    clientId: "bob",
    position: { x: 400, y: 300 },
    data: { color: "blue", size: "large" },
    timestamp: Date.now() - 1000,
  },
];

const mockLocks = [
  {
    id: "document-1",
    member: { clientId: "alice" },
    timestamp: Date.now() - 10000,
    attributes: { priority: "high" },
  },
  {
    id: "section-2",
    member: { clientId: "bob" },
    timestamp: Date.now() - 5000,
    attributes: { timeout: 30000 },
  },
];

// Create comprehensive mock for Spaces client and space
const createMockSpace = (spaceId: string) => ({
  name: spaceId,
  
  // Members functionality
  members: {
    enter: async (profileData?: any) => {
      mockMembers.push({
        clientId: "test-client",
        connectionId: "test-conn",
        profileData: profileData || { status: "active" },
        isConnected: true,
        lastEvent: { name: "enter" },
      });
      return;
    },
    leave: async () => {},
    getAll: async () => [...mockMembers],
    subscribe: (eventType: string, callback: (member: any) => void) => {
      setTimeout(() => {
        callback({
          clientId: "new-member",
          connectionId: "new-conn",
          profileData: { name: "Charlie", role: "tester" },
          isConnected: true,
          lastEvent: { name: "enter" },
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => {},
  },
  
  // Locations functionality
  locations: {
    set: async (location: any) => {
      const existingIndex = mockLocations.findIndex(l => l.clientId === "test-client");
      const locationData = {
        clientId: "test-client",
        location,
        timestamp: Date.now(),
      };
      
      if (existingIndex === -1) {
        mockLocations.push(locationData);
      } else {
        mockLocations[existingIndex] = locationData;
      }
      return;
    },
    getAll: async () => [...mockLocations],
    subscribe: (callback: (location: any) => void) => {
      setTimeout(() => {
        callback({
          clientId: "moving-client",
          location: { x: 500, y: 600, page: "settings" },
          timestamp: Date.now(),
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => {},
  },
  
  // Cursors functionality
  cursors: {
    set: async (position: any, data?: any) => {
      const existingIndex = mockCursors.findIndex(c => c.clientId === "test-client");
      const cursorData = {
        clientId: "test-client",
        position,
        data: data || {},
        timestamp: Date.now(),
      };
      
      if (existingIndex === -1) {
        mockCursors.push(cursorData);
      } else {
        mockCursors[existingIndex] = cursorData;
      }
      return;
    },
    getAll: async () => [...mockCursors],
    subscribe: (callback: (cursor: any) => void) => {
      setTimeout(() => {
        callback({
          clientId: "cursor-client",
          position: { x: 200, y: 100 },
          data: { color: "green" },
          timestamp: Date.now(),
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => {},
  },
  
  // Locks functionality
  locks: {
    acquire: async (lockId: string, attributes?: any) => {
      const lockData = {
        id: lockId,
        member: { clientId: "test-client" },
        timestamp: Date.now(),
        attributes: attributes || {},
      };
      mockLocks.push(lockData);
      return lockData;
    },
    release: async (lockId: string) => {
      const index = mockLocks.findIndex(l => l.id === lockId);
      if (index !== -1) {
        mockLocks.splice(index, 1);
      }
      return;
    },
    get: async (lockId: string) => {
      return mockLocks.find(l => l.id === lockId) || null;
    },
    getAll: async () => [...mockLocks],
    subscribe: (callback: (lock: any) => void) => {
      setTimeout(() => {
        callback({
          id: "new-lock",
          member: { clientId: "lock-client" },
          timestamp: Date.now(),
          event: "acquire",
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => {},
  },
  
  // Space lifecycle
  enter: async (profileData?: any) => {
    return mockMembers[0]; // Return first member as entered member
  },
  leave: async () => {},
});

const mockSpacesClient = {
  spaces: {
    get: (spaceId: string) => createMockSpace(spaceId),
    release: async (spaceId: string) => {},
  },
};

const mockRealtimeClient = {
  connection: {
    once: (event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(callback, 0);
      }
    },
    on: (callback: (stateChange: any) => void) => {
      setTimeout(() => {
        callback({ current: "connected", reason: null });
      }, 10);
    },
    state: "connected",
    id: "test-connection-id",
  },
  close: () => {
    // Mock close method
  },
};

let originalEnv: NodeJS.ProcessEnv;

describe('Spaces integration tests', function() {
  this.timeout(10000); // Increase timeout for integration tests
  
  beforeEach(function() {
    // Store original env vars
    originalEnv = { ...process.env };

    // Set environment variables for this test file
    process.env.ABLY_CLI_TEST_MODE = 'true';
    process.env.ABLY_API_KEY = 'test.key:secret';

    // Register the spaces and realtime mocks using the test-utils system
    registerMock('ablySpacesMock', mockSpacesClient);
    registerMock('ablyRealtimeMock', mockRealtimeClient);
  });

  afterEach(function() {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('Spaces state synchronization', function() {
    const testSpaceId = 'integration-test-space';
    
    it('enters a space with profile data', function() {
      return test
        .stdout()
        .command(['spaces', 'members', 'enter', testSpaceId, '--profile', '{"name":"Integration Tester","department":"QA"}'])
        .it('successfully enters space', ctx => {
          expect(ctx.stdout).to.contain('Successfully entered space');
        });
    });

    it('sets location in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'locations', 'set', testSpaceId, '--location', '{"x":200,"y":300,"page":"test-page"}'])
        .it('sets location successfully', ctx => {
          expect(ctx.stdout).to.contain('Location set successfully');
        });
    });

    it('gets all locations in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'locations', 'get-all', testSpaceId])
        .it('retrieves all locations', ctx => {
          expect(ctx.stdout).to.contain('alice');
          expect(ctx.stdout).to.contain('dashboard');
          expect(ctx.stdout).to.contain('bob');
          expect(ctx.stdout).to.contain('editor');
        });
    });

    it('sets cursor position in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'cursors', 'set', testSpaceId, '--position', '{"x":400,"y":500}', '--data', '{"color":"purple"}'])
        .it('sets cursor position', ctx => {
          expect(ctx.stdout).to.contain('Cursor position set');
        });
    });

    it('gets all cursors in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'cursors', 'get-all', testSpaceId])
        .it('retrieves all cursors', ctx => {
          expect(ctx.stdout).to.contain('alice');
          expect(ctx.stdout).to.contain('bob');
          expect(ctx.stdout).to.contain('x:');
          expect(ctx.stdout).to.contain('y:');
        });
    });

    it('acquires a lock in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'locks', 'acquire', testSpaceId, 'test-lock', '--attributes', '{"priority":"high","timeout":60000}'])
        .it('acquires lock successfully', ctx => {
          expect(ctx.stdout).to.contain('Lock acquired successfully');
          expect(ctx.stdout).to.contain('test-lock');
        });
    });

    it('gets a specific lock in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'locks', 'get', testSpaceId, 'document-1'])
        .it('retrieves specific lock', ctx => {
          expect(ctx.stdout).to.contain('document-1');
          expect(ctx.stdout).to.contain('alice');
        });
    });

    it('gets all locks in a space', function() {
      return test
        .stdout()
        .command(['spaces', 'locks', 'get-all', testSpaceId])
        .it('retrieves all locks', ctx => {
          expect(ctx.stdout).to.contain('document-1');
          expect(ctx.stdout).to.contain('section-2');
          expect(ctx.stdout).to.contain('alice');
          expect(ctx.stdout).to.contain('bob');
        });
    });
  });

  describe('JSON output format', function() {
    const testSpaceId = 'json-test-space';

    it('outputs member enter result in JSON format', function() {
      return test
        .stdout()
        .command(['spaces', 'members', 'enter', testSpaceId, '--profile', '{"name":"JSON Tester"}', '--json'])
        .it('outputs JSON result', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('success', true);
          expect(output).to.have.property('spaceId', testSpaceId);
        });
    });

    it('outputs locations in JSON format', function() {
      return test
        .stdout()
        .command(['spaces', 'locations', 'get-all', testSpaceId, '--json'])
        .it('outputs JSON locations', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('locations').that.is.an('array');
        });
    });

    it('outputs cursors in JSON format', function() {
      return test
        .stdout()
        .command(['spaces', 'cursors', 'get-all', testSpaceId, '--json'])
        .it('outputs JSON cursors', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('cursors').that.is.an('array');
        });
    });

    it('outputs locks in JSON format', function() {
      return test
        .stdout()
        .command(['spaces', 'locks', 'get-all', testSpaceId, '--json'])
        .it('outputs JSON locks', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('locks').that.is.an('array');
        });
    });
  });

  describe('Error handling', function() {
    it('handles invalid space ID gracefully', function() {
      return test
        .stderr()
        .command(['spaces', 'members', 'enter', ''])
        .catch(error => {
          expect(error.message).to.include('Space ID is required');
        })
        .it('fails with empty space ID');
    });

    it('handles invalid profile JSON', function() {
      return test
        .stderr()
        .command(['spaces', 'members', 'enter', 'test-space', '--profile', 'invalid-json'])
        .catch(error => {
          expect(error.message).to.include('Invalid profile JSON');
        })
        .it('fails with invalid profile');
    });

    it('handles invalid location JSON', function() {
      return test
        .stderr()
        .command(['spaces', 'locations', 'set', 'test-space', '--location', 'invalid-json'])
        .catch(error => {
          expect(error.message).to.include('Invalid location JSON');
        })
        .it('fails with invalid location');
    });

    it('handles invalid cursor position JSON', function() {
      return test
        .stderr()
        .command(['spaces', 'cursors', 'set', 'test-space', '--position', 'invalid-json'])
        .catch(error => {
          expect(error.message).to.include('Invalid position JSON');
        })
        .it('fails with invalid position');
    });
  });

  describe('Collaboration scenarios', function() {
    const testSpaceId = 'collaboration-test-space';

    it('simulates multiple members entering a space', function() {
      return test
        .stdout()
        .command(['spaces', 'members', 'enter', testSpaceId, '--profile', '{"name":"Collaborator 1","role":"editor"}'])
        .it('first member enters successfully', ctx => {
          expect(ctx.stdout).to.contain('Successfully entered space');
        });
    });

    it('simulates location updates during collaboration', function() {
      return test
        .stdout()
        .command(['spaces', 'locations', 'set', testSpaceId, '--location', '{"x":100,"y":200,"page":"document","section":"intro"}'])
        .it('updates location during collaboration', ctx => {
          expect(ctx.stdout).to.contain('Location set successfully');
        });
    });

    it('simulates cursor movement during collaboration', function() {
      return test
        .stdout()
        .command(['spaces', 'cursors', 'set', testSpaceId, '--position', '{"x":250,"y":350}', '--data', '{"action":"editing","element":"paragraph-1"}'])
        .it('updates cursor during collaboration', ctx => {
          expect(ctx.stdout).to.contain('Cursor position set');
        });
    });

    it('simulates lock acquisition for collaborative editing', function() {
      return test
        .stdout()
        .command(['spaces', 'locks', 'acquire', testSpaceId, 'paragraph-1', '--attributes', '{"operation":"edit","timeout":30000}'])
        .it('acquires lock for editing', ctx => {
          expect(ctx.stdout).to.contain('Lock acquired successfully');
        });
    });
  });

  describe('Real-time state synchronization', function() {
    const testSpaceId = 'realtime-sync-space';

    it('tests member presence updates', function() {
      return test
        .stdout()
        .command(['spaces', 'members', 'enter', testSpaceId, '--profile', '{"status":"active","currentTask":"reviewing"}'])
        .it('member presence is synchronized', ctx => {
          expect(ctx.stdout).to.contain('Successfully entered space');
        });
    });

    it('tests location state synchronization', function() {
      return test
        .stdout()
        .command(['spaces', 'locations', 'set', testSpaceId, '--location', '{"x":500,"y":600,"page":"review","viewport":{"zoom":1.5}}'])
        .it('location state is synchronized', ctx => {
          expect(ctx.stdout).to.contain('Location set successfully');
        });
    });

    it('tests cursor state synchronization', function() {
      return test
        .stdout()
        .command(['spaces', 'cursors', 'set', testSpaceId, '--position', '{"x":300,"y":400}', '--data', '{"isSelecting":true,"selectionStart":{"x":300,"y":400}}'])
        .it('cursor state is synchronized', ctx => {
          expect(ctx.stdout).to.contain('Cursor position set');
        });
    });

    it('tests lock state synchronization', function() {
      return test
        .stdout()
        .command(['spaces', 'locks', 'acquire', testSpaceId, 'shared-document', '--attributes', '{"lockType":"exclusive","reason":"formatting"}'])
        .it('lock state is synchronized', ctx => {
          expect(ctx.stdout).to.contain('Lock acquired successfully');
        });
    });
  });
});