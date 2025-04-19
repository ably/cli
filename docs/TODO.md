# Tasks

## Features

- [ ] Support auto-complete for commands
- [ ] Support auto-update
- [ ] Web example should tell the user to install the CLI locally if there are connection issues / CLI has not loaded
- [ ] Web example should support non logged in mode (i.e. for docs for example) where commands that rely on the control API, or channel enumeration (surfacing other user activity) are disabled. The user should be told that this functionality is not available to anonymous users and they should sign up / login.
- [ ] Connection handling of Web CLI no longer seems to show the connecting state and number of attempts correctly.
- [ ] When an API key or Access Token fails with a 40x error, it should show the error message without a stack trace, and should tell the user to reauth appropriately i.e. using `ably login` for access tokens, or `ably auth keys switch` for API keys. Here is the error message from an access token that failed:
  ```sh
  $ ably apps stats
  ›   Error: No app ID provided and no default app selected. Please specify an app ID or select a default app with "ably apps
  ›   switch".
  $ ably apps switch
  Select an app to switch to:
  Error fetching apps: Error: Control API request failed: 401 Unauthorized - {"message":"Access denied","code":40100,"statusCode":401,"href":"https://help.ably.io/error/40100","details":null}
  ```
- [ ] Ensure `ably account current`, `ably apps current`, and `ably auth keys current` commands exist consisetntly so that the user can see which account, app, and key are currently being used. Additionally, if `ably accounts switch` is called, and the user has not logged in yet, instead of showing the error "Error: No accounts configured. Use "ably accounts login" to add an account.", simply go proxy the request to `ably accounts login`.

## UI/UX Improvements

- [ ] The CLI should standardise on how commands are shown when running the topic such as `ably accounts` where all sub-commands are shown, and only when `--help` is used examples are shown along with all commands.
  - [ ] Note the examples are generally spaced out vertically with a blank line between each, we should be consistent in keeping the vertical spacing concise and remove unnecessary white space.
  - [ ] All CLI commands should be listed in the index.ts files for each topic, and whenever a new command is added, the index.ts file for that topic should be updated.
  - [ ] The output for each empty topic, such as `ably spaces`, should be consistent in format, with the title "Ably [Topic] commands:", then a list of all the commands available, and then provide a comment beneath stating "Run `ably [Topic] COMMAND --help` for more information on a command."
  - [ ] Much like we do for the root help in createCustomWelcomeScreen in help.ts, we should autogenerate this to avoid unnecessary maintenance of the help for the root topics.
  - [ ] Additionally, when the command with --help is run for each command, the auto-generated output should also be colour coded to make it more legible (is this a job for standard oclif themes), and the examples listed should not have vertical space between each one like they currently are.
- [ ] The terminal interface resizes vertically as expected, however the bottom line of the terminal is often partially cropped as a result of it expanding by a few pixels, which appears to add a text line to the terminal, but there is not enough vertical space to show it. As such, the terminal is sort of broken once full as the bottom line is always cropped. Can you ensure that a complete line of text is always visible at the bottom of the terminal.

## Security

- [ ] The Docker web terminal restrictions on what commands can be run is pretty poor as you can use & or | operators to simply get around this. For example, running `$ ably > /dev/null | echo "Hello"` returns "Hello", showing that the user can run additional commands.

## API and Architecture

- [ ] Ensure all Ably channels commands that should use the REST API do, by default
- [ ] Standardise on use of createAblyClient for both Rest and Realtime. It's odd that we have to explicitly call showAuthInfoIfNeeded when using Ably.Rest, but not for createAblyClient. CreateAblyClient should simply support Rest and Realtime, and ensure showAuthInfoIfNeeded will only execute once in case both Rest and Realtime are used.
- [ ] MCP server is not fully implemented, see log below. We should implement it so that it works fully for resources as expected.
  ```text
  2025-04-11T23:03:05.759Z [ably] [info] Message from client: {"method":"prompts/list","params":{},"jsonrpc":"2.0","id":24}
  2025-04-11T23:03:05.760Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":24,"error":{"code":-32601,"message":"Method not found"}}
  2025-04-11T23:03:09.718Z [ably] [info] Message from client: {"method":"resources/list","params":{},"jsonrpc":"2.0","id":25}
  2025-04-11T23:03:10.969Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":25,"result":{"resources":[{"name":"Default","uri":"ably://apps/cPr1qg","current":true},{"name":"Collaboration Tampermonkey","uri":"ably://apps/hdBgGA","current":false}]}}
  2025-04-11T23:03:10.969Z [ably] [info] Message from client: {"method":"prompts/list","params":{},"jsonrpc":"2.0","id":26}
  2025-04-11T23:03:10.970Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":26,"error":{"code":-32601,"message":"Method not found"}}
  2025-04-11T23:03:14.716Z [ably] [info] Message from client: {"method":"resources/list","params":{},"jsonrpc":"2.0","id":27}
  2025-04-11T23:03:15.346Z [ably] [info] Message from client: {"method":"resources/read","params":{"uri":"ably://apps/cPr1qg"},"jsonrpc":"2.0","id":28}
  2025-04-11T23:03:15.350Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":28,"error":{"code":-32602,"message":"MCP error -32602: Resource ably://apps/cPr1qg not found"}}
  2025-04-11T23:03:15.493Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":27,"result":{"resources":[{"name":"Default","uri":"ably://apps/cPr1qg","current":true},{"name":"Collaboration Tampermonkey","uri":"ably://apps/hdBgGA","current":false}]}}
  ```

## Best Practices

- [ ] Document the folder structures and place this in a markdown file. Instruct local IDE to maintain this file.
- [ ] Ensure all changes meet the linting requirements, `pnpm exec eslint [file]`
- [ ] Look for areas of unnecessary duplication as help.ts checking "commandId.includes('accounts login')" when the list of unsupported web CLI commands exists already in BaseCommand WEB_CLI_RESTRICTED_COMMANDS
- [ ] Add inactivity timeout to the terminal server
- [ ] Build binaries and embed into the Docker image which should be published to Docker Hub.
- [ ] Release new versions automatically from Github for NPM
