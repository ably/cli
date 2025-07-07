# 🛠 Ably CLI Restructure: Help System and Support Topic

## Objective

Align the CLI with industry standards by:

* Making the `help` command idiomatic and intuitive
* Avoiding overloaded or redundant command names (e.g. `help help`, `support support`)
* Promoting support-related features to a dedicated and clearly named topic

---

## 🎯 Key Changes

### ✅ 1. Update `help` Command Behavior

#### Current:

* `ably help` shows all commands and also includes `help ask`, `help contact`, etc.
* `help` is treated as both a command and a topic, leading to confusion.

#### New behavior:

* `ably help` or `ably` → show standard CLI usage and list of root commands.
* `ably help <command>` → show help for that command (equivalent to `ably <command> --help`).
* `--help` or `-h` → supported on all commands and subcommands.
* `help` is no longer treated as a parent command topic (remove `help ask`, `help contact`, etc).

#### Notes:

* Ensure command-specific help works with both `--help` and `help <command>`.
* The interactive shell should behave consistently with the above (`help` triggers the standard usage view).

---

### ✅ 2. Promote `status` to a Top-Level Command

#### Old:

* `help status`

#### New:

* `ably status`

#### Behavior:

* Show current Ably service status
* Optionally support `--open` flag to launch status page in browser

---

### ✅ 3. Create a New `support` Topic

Rename and regroup support-related subcommands under a new topic: `support`.

#### Command structure:

```bash
ably support ask
ably support contact
ably support info
```

#### Command Details:

| Command                | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `ably support ask`     | Interact with the Ably AI assistant for usage questions   |
| `ably support contact` | Show how to contact Ably (e.g. email, portal, link)       |
| `ably support info`    | Show general support guidance (previously `help support`) |

* `ably support` without args → show summary of available subcommands (ask, contact, info).
* Remove `help ask`, `help contact`, `help support`.

---

## 🧹 Cleanup and Consistency

* Remove all traces of the old `help` subcommands from help output and CLI structure.
* Ensure all commands under `support` and `status` have:

  * Proper descriptions in `--help` output
  * Tab completion (if supported)
  * Visibility in interactive mode's root listing (or in the “support” section)

---

## 📋 Final Command Overview

| Command                 | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `ably help`             | Show help and list of top-level commands          |
| `ably <command> --help` | Show help for a specific command                  |
| `ably help <command>`   | Alias for above                                   |
| `ably status`           | Check the current status of Ably systems          |
| `ably support ask`      | Ask Ably’s AI assistant a usage question          |
| `ably support contact`  | Show how to reach Ably’s support team             |
| `ably support info`     | General support resources and documentation links |

---

## 🗣 Messaging / UX Suggestions

* In `ably --help` output, add a **Support Commands** section:

  ```
  SUPPORT COMMANDS
    support ask         Ask the Ably AI assistant a usage question
    support contact     Show how to contact Ably
    support info        General support resources and links
    status              Check current status of Ably's platform
  ```

* In interactive mode welcome message, consider:

  ```
  Type 'help' to see all commands. Need assistance? Try 'support ask' or 'support contact'.
  ```

# CLI Terminal Server

Please look at the code in the Terminal Server (/cli-terminal-server) and investigate what tests or code may depend on this structure that may now need updating. For example, we have `help web-cli` command which will no longer exist. Consider whether we should change `help web-cli` completely and just make it an argument of the root level help command such as --web-cli. Consider whether there are any other hidden commands under help too that need addressing. Make changes to both repositories to reflect these changes.

Once done, ensure all tests and linting is passing in the main CLI. 

We will then need to do a minor release of the CLI, so that we can test the changes in the CLI terminal server. Confirm when that is ready to be done, and bump the 0.9.0-alpha.[version] and tell me when to publish the NPM package.

---

## ✅ Deliverables Checklist

* [ ] Remove existing `help` subcommands from the command tree
* [ ] Add `support` topic and subcommands:
  * [ ] `support ask`
  * [ ] `support contact`
  * [ ] `support info`
* [ ] Promote `status` to root command
* [ ] Ensure `help`, `--help`, and `help <command>` all work consistently
* [ ] Update CLI banner, `--help` output, and interactive shell messages
* [ ] Validate everything in interactive and non-interactive modes
* [ ] Ensure Terminal Server is updated to reflect these changes
* [ ] Once all tests in main are passing, confirm changes are made, so that we can bump the version and release a new NPM pacakge so that we can test the terminal server changes.

