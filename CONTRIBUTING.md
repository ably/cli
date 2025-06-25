# Contributing to the Ably CLI

Thank you for your interest in contributing to the Ably CLI!

## Development Workflow

All code changes, whether features or bug fixes, **MUST** follow the mandatory workflow outlined in [.cursor/rules/Workflow.mdc](mdc:.cursor/rules/Workflow.mdc).

In summary, this involves:

1.  **Build:** Run `pnpm prepare` to compile, update manifests, and update the README.
2.  **Lint:** Run `pnpm exec eslint .` and fix all errors/warnings.
3.  **Test:** Run relevant tests (`pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:playwright`, or specific files) and ensure they pass. Add new tests or update existing ones as needed.
4.  **Document:** Update all relevant documentation (`docs/`, `.cursor/rules/`, `README.md`) to reflect your changes.

**Pull requests will not be merged unless all these steps are completed and verified.**

## Key Documents

Before starting work, please familiarize yourself with:

*   [Product Requirements](./docs/Product-Requirements.md): Understand the goals and features.
*   [Project Structure](./docs/Project-Structure.md): Know where different code components live.
*   [Testing Strategy](./docs/Testing.md): Understand the different types of tests and how to run them.
*   [Development Rules](mdc:.cursor/rules/Development.mdc): Coding standards, linting, dependency management.
*   [Ably Rules](mdc:.cursor/rules/Ably.mdc): How to interact with Ably APIs/SDKs.

## Reporting Issues

Please report bugs or suggest features using GitHub Issues.

## Submitting Pull Requests

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes, ensuring you follow the **Mandatory Development Workflow** described above.
4.  Commit your changes with clear messages.
5.  Push your branch to your fork.
6.  Create a Pull Request against the `main` branch of the `ably/cli` repository.
7.  Ensure all CI checks pass.

## Testing Against Local Terminal Server

For Ably engineers working on terminal server features:

1. Clone the private `cli-terminal-server` repository
2. Run the server locally: `pnpm dev`
3. Set environment variable: `export TERMINAL_SERVER_URL=ws://localhost:8080` (adjust the port if your local server runs on a different port)
4. Run CLI tests: `pnpm test:e2e`

This allows testing CLI changes against local server modifications before deployment.

## Release Workflow

1. Make sure all checks are passing on main
2. Create a new release branch, in the format `release/<version>` where the version is the SemVer version of the release. In that branch:
    - Update the `package.json` version to the new version.
    - Run `npx oclif readme` to regenerate the README with updated command documentation.
    - Update the `CHANGELOG.md` with any user-affecting changes since the last release.
    - Review the generated README.md changes to ensure they're correct.
    - Stage all changes: `git add package.json README.md CHANGELOG.md`
    - Commit all changes with a message like `chore: prepare release <version>`.
3. Once the release branch is approved, merge it into main.
4. Create a new tag on the merged commit in main, which will run the release workflow:
    ```bash
    git tag -a v<version> -m "Release v<version>"
    git push origin v<version>
    ```
5. Verify that:
    - The GitHub Actions release workflow completes successfully
    - A new GitHub release is created
    - The new release has been published to NPM
