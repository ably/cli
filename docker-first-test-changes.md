1. WebSocket Ctrl+C Handling Tests (Missing TypeScript Implementation)

  - Need to create TypeScript test files for Ctrl+C behavior (currently only compiled JS exists in dist/)
  - Test JSON payload format: {"type":"data","payload":"\x03"}
  - Test that readline properly receives and processes Ctrl+C
  - Test signal feedback message behavior
  - Test prompt restoration after Ctrl+C

  2. Docker CLI Direct Tests Updates

  - Update expected behavior for ably-interactive wrapper script
  - Remove skipped tests that are now fixed:
    - Welcome message suppression after Ctrl+C
    - Multiple Ctrl+C handling
    - Immediate feedback on Ctrl+C

  3. WebSocket Message Handling Tests

  - Test that JSON WebSocket messages are properly parsed and only payload is sent to container
  - Test that raw JSON is never displayed in terminal output
  - Test proper handling of different message types: data, signal, resize

  4. Interactive Mode Command Tests

  - Test version command works in interactive mode
  - Test all INTERACTIVE_UNSUITABLE_COMMANDS are properly blocked:
    - autocomplete
    - config
    - version (as a command line argument, not the interactive command)
    - mcp

  5. Network Security Message Tests

  - Update tests to expect no [Network Security] message in normal mode
  - Add tests for debug mode where message should appear
  - Update existing tests that filter out this message

  6. Terminal Server Integration Tests

  - Replace placeholder tests in terminal-server.test.ts
  - Add actual WebSocket connection establishment tests
  - Add authentication flow tests
  - Add session management tests
  - Add command execution through WebSocket tests

  7. Exit Code and Signal Handling Tests

  - Test exit code 42 for wrapper mode
  - Test exit code 0 for direct mode
  - Test exit code 130 for SIGINT
  - Test proper cleanup on different exit scenarios

  8. Welcome Message and Prompt Tests

  - Test welcome message appears only once on startup
  - Test ABLY_SUPPRESS_WELCOME environment variable
  - Test prompt restoration without welcome after Ctrl+C
  - Test proper prompt display after commands

  9. Anonymous Mode Restriction Tests

  - Update tests for ABLY_ANONYMOUS_USER_MODE
  - Test restricted commands in anonymous mode
  - Test that security message behavior differs in anonymous mode

  10. Performance and Load Tests

  - Update load tests to account for new signal handling
  - Test concurrent Ctrl+C handling across multiple sessions
  - Test resource cleanup under load

  11. Test Infrastructure Updates

  - Update Dockerfile version reference from @ably/cli@0.9.0-alpha.3 to new version
  - Update test timeouts to account for wrapper script restart behavior
  - Add test utilities for WebSocket message construction
  - Update test documentation to reflect Docker-first testing strategy

  12. Manual Test Scripts

  - Update manual test scripts in tests/manual/ to reflect new behavior
  - Add manual test for interactive mode with wrapper script
  - Update signal handling manual tests

  Key Behavioral Changes to Test

  1. Ctrl+C no longer exits the container - wrapper script restarts the process
  2. Welcome message suppression works correctly after Ctrl+C
  3. Version command available as hidden command in interactive mode
  4. JSON messages are parsed, not displayed raw
  5. Network security message only in debug mode
  6. Signal feedback ("Signal received") on first Ctrl+C
  7. MCP command blocked in interactive mode

  All tests should follow the "Docker First, WebSocket Second" principle - verify actual Docker behavior first, then ensure WebSocket layer matches exactly.