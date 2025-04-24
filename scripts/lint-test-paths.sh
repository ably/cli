#!/bin/bash
# Script to run linting on test paths or all files

# Get the test pattern from the run-tests.sh script's last run
TEST_PATTERN="$ABLY_TEST_PATTERN"

# If a specific test pattern was used, lint only those files
if [ -n "$TEST_PATTERN" ] && [[ "$TEST_PATTERN" != "test/**/*.test.ts" ]]; then
  # Convert the test pattern to a corresponding source file pattern if it's a test file
  if [[ "$TEST_PATTERN" == *test*.ts ]]; then
    # Extract the directory structure for specific linting
    # Remove the 'test/' prefix and '.test.ts' suffix to get the component path
    COMPONENT_PATH=$(echo "$TEST_PATTERN" | sed 's|test/||g' | sed 's|\.test\.ts$||g')

    # Determine what to lint based on the type of test
    if [[ "$TEST_PATTERN" == test/unit/* ]]; then
      echo "Linting source files for unit tests: $TEST_PATTERN"
      SRC_PATTERN="src/${COMPONENT_PATH}.ts"
      pnpm exec eslint "$TEST_PATTERN" "$SRC_PATTERN" || echo "Warning: No matching source files found for $SRC_PATTERN"
    elif [[ "$TEST_PATTERN" == test/integration/* || "$TEST_PATTERN" == test/e2e/* ]]; then
      echo "Linting test files: $TEST_PATTERN"
      pnpm exec eslint "$TEST_PATTERN"
    else
      echo "Linting test files: $TEST_PATTERN"
      pnpm exec eslint "$TEST_PATTERN"
    fi
  else
    # If the pattern is a directory, lint all files in that directory
    echo "Linting all files in directory: $TEST_PATTERN"
    pnpm exec eslint "$TEST_PATTERN"
  fi
else
  # Run full linting as usual
  echo "Running full linting"
  pnpm run lint
fi
