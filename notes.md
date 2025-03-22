### Realtime Messaging & Channelsx

- Subscribe to one or more channels from the CLI.
  - Options should be available that match our subscription options. This should include rewind, deltas, encryption
  - Subscribe to occupancy command that shows occupancy updates
  - Subscribe to presence command that shows presence changes, and current set of members present in the channel
- Publish messages directly to channels
- Batch publish messages to channels using our REST batch API

### Connections

- Connect to Ably, emit debugging information and log to console, for debugging connection issues, allowing different connection options to be provided
- Monitor channel lifecycle events by simply subscribing to the [meta]connection.lifecycle events, and periodically show stats for connections using the stats API. This can be achieved by polling the app stats API every 6 seconds, showing the current number of connections

### Control API

- List, create, get, update, and delete apps
- List, create, get, update, and delete queues
- List, create, get,, update, and delete namespaces. Note that whilst in the CLI the terminology for this endpoint will match the endpoint namespaces, in all descriptions this should be described as "Channel rules for namespaces"
- List, create, update, and delete rules. Note that whilst in the CLI the terminology for this endpoint will match the endpoint rules, in all descriptions this should be described as "Integration rules"
- View historical account and app stats
- View live account and app metrics, using a nice UI layout to show the current connections, channels, peak message rates. You will need to poll the API every 3 seconds to get updates.
