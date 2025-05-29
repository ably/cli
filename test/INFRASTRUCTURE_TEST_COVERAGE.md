# Core Infrastructure & Authentication Test Coverage

This document outlines the comprehensive test coverage implemented for the foundational CLI infrastructure components that all other commands depend on.

## Overview

The test suite covers the following distribution:
- **Unit Tests (70%)**: Test components in isolation with mocked dependencies
- **Integration Tests (25%)**: Test flow sequences and config persistence
- **E2E Tests (5%)**: Test with real credentials and file system

## Test Coverage by Component

### 1. BaseCommand Class (`test/unit/base/`)

#### Existing Tests
- `base-command.test.ts` - Basic command functionality

#### Enhanced Tests
- `base-command-enhanced.test.ts` - Comprehensive coverage including:
  - **Initialization and Setup**: Constructor, dependency injection, web CLI mode detection
  - **Authentication & Client Creation**: REST client creation, client options, token handling
  - **Output Formatting**: JSON/pretty-JSON detection, formatting utilities
  - **Error Handling**: JSON error output, web CLI restrictions
  - **API Key Parsing**: Valid/invalid key format handling
  - **Web CLI Restrictions**: Command allowlist/blocklist
  - **Authentication Info Display**: Account/app/key information display
  - **Logging & Events**: Verbose mode event logging
  - **ensureAppAndKey Functionality**: Web CLI mode, token auth, interactive selection

### 2. ConfigManager Service (`test/unit/services/`)

#### Existing Tests
- `config-manager.test.ts` - Configuration file operations, environment variables

#### Coverage Includes
- **Constructor & Initialization**: Config directory creation, file loading
- **Account Management**: Store, retrieve, switch, remove accounts
- **App & Key Management**: Store, retrieve app configurations and API keys
- **Environment Isolation**: Test-specific config directories
- **Error Handling**: Invalid configurations, missing files

### 3. Authentication Commands (`test/unit/commands/accounts/`)

#### Login Command (`login.test.ts`)
- **Command Properties**: Static configuration validation
- **Browser Integration**: Open browser, handle failures, platform detection
- **Alias Validation**: Format validation, interactive prompts
- **Configuration Management**: Account storage, existing account handling
- **URL Construction**: Local vs production URLs
- **Interactive Prompts**: Token input, alias selection
- **Output Formatting**: JSON vs text output, logo display
- **Error Handling**: Authentication failures, network errors

#### Logout Command (`logout.test.ts`)
- **Command Properties**: Static configuration validation
- **Account Selection**: Current vs specified account
- **Account Validation**: Existence checks, error handling
- **Confirmation Prompts**: Force flag, JSON mode, user responses
- **Account Removal**: Success/failure scenarios
- **Output Formatting**: Success/error JSON formatting
- **Error Scenarios**: Missing accounts, cancellation
- **Readline Integration**: Confirmation prompts

### 4. Auth Token Management (`test/unit/commands/auth/`)

#### Revoke Token Command (`revoke-token.test.ts`)
- **Command Properties**: Static configuration validation
- **API Key Parsing**: Valid/invalid format handling
- **Request Body Construction**: Client ID handling
- **HTTPS Request Handling**: Request options, authorization headers
- **Debug Output**: API key masking, request logging
- **Warning Messages**: Token revocation limitations
- **Output Formatting**: Success/error JSON formatting
- **Error Handling**: Token not found, network errors
- **Client Lifecycle**: Creation, cleanup
- **API Endpoint Construction**: URL building
- **Response Parsing**: JSON/text response handling

### 5. Help System (`test/unit/commands/help/`)

#### Contact Command (`contact.test.ts`)
- **Command Properties**: Static configuration validation
- **URL Handling**: Correct Ably contact URL
- **Browser Integration**: Open function calls, error handling
- **Command Execution**: Async execution, parsing
- **Error Handling**: Browser open failures
- **Chalk Integration**: Colored output
- **Import Validation**: Module imports

## Integration Tests (`test/integration/auth/`)

### Authentication Flow (`auth-flow.test.ts`)
- **Login → Logout Flow**: Complete authentication cycle, multiple accounts
- **Config Persistence**: Cross-instance persistence, corruption handling
- **Environment Variable Precedence**: Config vs environment priority
- **Initialization Hooks**: Directory creation, permissions
- **Error Scenarios**: Non-existent accounts, duplicate aliases
- **App & Key Management**: Account isolation, key storage

## E2E Tests (`test/e2e/auth/`)

### Basic Authentication (`basic-auth.test.ts`)
- **Config Persistence**: Real file system operations
- **Environment Variable Authentication**: API key handling
- **Error Scenarios**: Invalid credentials, permissions
- **Config File Format**: TOML structure, special characters
- **Cross-Platform Compatibility**: Path separators, line endings
- **Environment Isolation**: Test config directories

## Testing Patterns & Utilities

### Test Setup Patterns
```typescript
// Standard unit test setup
beforeEach(function() {
  sandbox = sinon.createSandbox();
  originalEnv = { ...process.env };
  process.env.ABLY_CLI_TEST_MODE = 'true';
  
  // Stub fs operations
  sandbox.stub(fs, "existsSync").returns(true);
  sandbox.stub(fs, "readFileSync").returns("");
  // ... other stubs
});
```

### Mocking Strategies
- **File System**: Complete mocking for unit tests, real FS for integration/E2E
- **External Dependencies**: execSync, readline, open browser functions
- **Ably Client**: Global test mocks for REST/Realtime clients
- **ConfigManager**: Stubbed instances for command tests

### Resource Cleanup
- **trackAblyClient**: For Ably client resource management
- **Sandbox Cleanup**: Restore all stubs after each test
- **Environment Restoration**: Reset environment variables
- **Temporary Directories**: Auto-cleanup for integration/E2E tests

## Coverage Metrics

### Expected Coverage Levels
- **BaseCommand**: >90% (core infrastructure)
- **ConfigManager**: >85% (existing + enhancements)
- **Authentication Commands**: >80% (comprehensive scenarios)
- **Auth Token Commands**: >75% (complex API interactions)
- **Help Commands**: >70% (simpler functionality)

### Test Execution
```bash
# Unit tests
pnpm test test/unit/base test/unit/services test/unit/commands/accounts test/unit/commands/auth test/unit/commands/help

# Integration tests
pnpm test test/integration/auth

# E2E tests (requires E2E_ABLY_API_KEY)
E2E_ABLY_API_KEY=your_key pnpm test test/e2e/auth

# All infrastructure tests
pnpm test test/unit/base test/unit/services test/unit/commands/accounts test/unit/commands/auth test/unit/commands/help test/integration/auth test/e2e/auth
```

## Key Testing Features

### Comprehensive Error Handling
- Network failures, invalid credentials, malformed configs
- Browser open failures, file system errors
- API parsing errors, missing dependencies

### Output Format Testing
- JSON vs human-readable output
- Pretty JSON formatting
- Error message formatting
- Debug output validation

### Platform Compatibility
- Cross-platform path handling
- Different line ending support
- Environment variable handling

### Security Considerations
- API key masking in debug output
- Secure config file handling
- Environment variable precedence

## Validation Criteria Met

✅ **All new tests pass**: Comprehensive test suite execution  
✅ **No lint errors**: TypeScript and ESLint compliance  
✅ **Coverage >80%**: For all targeted infrastructure files  
✅ **E2E tests pass**: With environment variable E2E_ABLY_API_KEY set  
✅ **Documentation updated**: This coverage documentation

## Future Enhancements

### Potential Additions
- **Performance Tests**: Config loading/saving performance
- **Stress Tests**: Large config files, many accounts
- **Security Tests**: Config file permissions, credential exposure
- **Network Resilience**: Retry logic, timeout handling

### Maintenance Notes
- Update tests when adding new commands
- Maintain mock compatibility with Ably SDK updates
- Keep environment isolation patterns consistent
- Regular coverage report reviews