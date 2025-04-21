# Project Structure

This document outlines the directory structure of the Ably CLI project.

/
├── assets/                 # Static assets like images.
│   └── cli-screenshot.png  # Screenshot of the CLI.
├── bin/                    # Executable scripts for running the CLI.
│   ├── dev.cmd             # Development run script (Windows).
│   ├── development.js      # Development run script (Unix).
│   ├── run.cmd             # Production run script (Windows).
│   └── run.js              # Production run script (Unix).
├── docs/                   # Project documentation.
│   ├── Product-Requirements.md # Detailed product requirements.
│   ├── Project-Structure.md  # This file, outlining the project structure.
│   ├── Testing.md          # Testing strategy and policy.
│   └── TODO.md             # List of outstanding tasks.
├── examples/               # Example usage of the CLI or related components.
│   └── web-cli/            # Example implementation of the web-based CLI.
├── packages/               # Internal packages used by the project.
│   └── react-web-cli/      # React component for the web-based CLI.
├── scripts/                # Utility scripts for development and deployment.
│   ├── restricted-shell.sh # Shell script for the restricted Docker environment.
│   ├── terminal-server.ts  # Server implementation for the web CLI terminal.
│   ├── terminal-test-client.ts # Test client for the terminal server.
│   └── test-web-cli.sh     # Script to test the web CLI functionality.
├── src/                    # Source code for the CLI.
│   ├── base-command.ts     # Base class for all CLI commands, containing common logic.
│   ├── chat-base-command.ts # Base class specific to Ably Chat commands.
│   ├── commands/           # oclif commands implementation.
│   │   ├── accounts/       # Commands related to Ably account management.
│   │   ├── apps/           # Commands related to Ably app management.
│   │   ├── auth/           # Commands related to authentication (keys, tokens).
│   │   ├── bench/          # Commands for benchmarking Ably features.
│   │   ├── channel-rule/   # Commands for managing channel rules (namespaces).
│   │   ├── channels/       # Commands for interacting with Ably Pub/Sub channels.
│   │   ├── config.ts       # Command to open the CLI configuration file.
│   │   ├── connections/    # Commands related to client connections.
│   │   ├── help/           # Commands for getting help (AI agent, contact).
│   │   ├── integrations/   # Commands for managing Ably integrations (rules).
│   │   ├── login.ts        # Alias command for `accounts login`.
│   │   ├── logs/           # Commands for subscribing to various log streams.
│   │   ├── mcp/            # Commands specific to the MCP server functionality.
│   │   ├── queues/         # Commands for managing Ably Queues.
│   │   ├── rooms/          # Commands for interacting with Ably Chat rooms.
│   │   └── spaces/         # Commands for interacting with Ably Spaces.
│   ├── control-base-command.ts # Base class for commands interacting with the Control API.
│   ├── help.ts             # Custom help class implementation.
│   ├── hooks/              # oclif lifecycle hooks.
│   │   ├── command_not_found/ # Hook for handling unknown commands.
│   │   └── init/           # Hook executed at CLI initialization.
│   ├── index.ts            # Main entry point for the CLI source.
│   ├── mcp/                # Code related to the Model Context Protocol (MCP) server.
│   │   ├── index.ts        # Entry point for MCP functionality.
│   │   └── mcp-server.ts   # Implementation of the MCP server.
│   ├── services/           # Core services used across commands.
│   │   ├── config-manager.ts # Service for managing CLI configuration.
│   │   ├── control-api.ts  # Service for interacting with the Ably Control API.
│   │   ├── interactive-helper.ts # Helper for interactive CLI prompts.
│   │   └── stats-display.ts  # Service for displaying stats information.
│   ├── spaces-base-command.ts # Base class specific to Ably Spaces commands.
│   ├── types/              # TypeScript type definitions.
│   │   ├── cli.ts          # General CLI type definitions.
│   │   └── modelcontextprotocol.d.ts # Type definitions for MCP.
│   └── utils/              # Utility functions.
│       ├── json-formatter.ts # Utility for formatting JSON output.
│       └── logo.ts         # Utility for displaying the Ably logo ASCII art.
├── test/                   # Automated tests.
│   ├── commands/           # Tests for specific CLI commands.
│   ├── e2e/                # End-to-end tests that run CLI commands in real environment.
│   │   └── core/           # Core e2e tests for basic CLI functionality.
│   ├── hooks/              # Tests for oclif hooks.
│   │   └── command_not_found/ # Tests for the command_not_found hook.
│   ├── integration/        # Integration tests for testing command flows.
│   │   └── core/           # Core integration tests.
│   ├── unit/               # Unit tests for internal components.
│   │   ├── base/           # Tests for base command classes.
│   │   └── services/       # Tests for service components.
│   └── tsconfig.json       # TypeScript configuration specific to tests.
├── .cursor/                # Cursor AI configuration and rules.
│   └── rules/
│       ├── project.mdc     # Rules specific to the overall project context.
│       └── ably.mdc        # Rules specific to Ably concepts and APIs.
│       └── development.mdc # Rules specific to development practices (Node, TS, oclif).
├── .env.example            # Example environment variables file.
├── .eslintignore           # Files/patterns ignored by ESLint.
├── .eslintrc.js            # ESLint configuration file.
├── .gitignore              # Files/patterns ignored by Git.
├── .mocharc.json           # Mocha test runner configuration.
├── .prettierrc.json        # Prettier code formatter configuration.
├── CHANGELOG.md            # Log of changes across versions.
├── README.md               # Main project README file.
├── oclif.manifest.json     # oclif manifest file, generated during build.
├── package.json            # Node.js project manifest (dependencies, scripts).
├── pnpm-lock.yaml          # pnpm lock file for deterministic installs.
├── pnpm-workspace.yaml     # Defines the pnpm workspace configuration.
└── tsconfig.json           # Main TypeScript configuration file.
