# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Reading

**IMPORTANT:** Before working on this codebase, you MUST read all the canonical rule files in `.cursor/rules/` ending with `.mdc`:

- `.cursor/rules/Workflow.mdc` - **MANDATORY** development workflow (build, lint, test, documentation)
- `.cursor/rules/Development.mdc` - Node.js, TypeScript, oclif framework guidelines 
- `.cursor/rules/Project.mdc` - Project-specific patterns and architecture
- `.cursor/rules/Ably.mdc` - Ably product concepts and API usage
- `.cursor/rules/AI-Assistance.mdc` - Guidelines for AI assistance

## Documentation References

When the `.cursor/rules/*.mdc` files reference other documentation with `@` or `mdc:` prefixes, these files are located in:
- `/docs/` directory (e.g., `docs/Testing.md`, `docs/Project-Structure.md`)
- Root-level files (e.g., `README.md`)

## Quick Commands Reference

For immediate development needs:
```bash
# MANDATORY workflow for all changes
pnpm prepare && pnpm exec eslint . && pnpm test:unit

# Run all tests
pnpm test

# Validate all changes and run all tests prior to pushing to CI
pnpm validate

# Development CLI
pnpm dev
```

**Always refer to the `.cursor/rules/*.mdc` files for complete and up-to-date guidance.**