# Account Stats Command

The `accounts stats` command allows you to view statistics for your Ably account, including metrics such as peak rates for messages, API requests, token requests, opened connections, and opened channels.

## Usage

```
ably accounts stats
```

## Options

- `--start`: Start time in milliseconds since epoch
- `--end`: End time in milliseconds since epoch
- `--unit`: Time unit for stats (minute, hour, day, month). Default: minute
- `--limit`: Maximum number of stats records to return. Default: 10
- `--format`: Output format (json, pretty). Default: pretty
- `--live`: Subscribe to live stats updates. Default: false
- `--interval`: Polling interval in seconds (only used with --live). Default: 6

## Examples

Basic usage (shows last 24 hours of stats):

```
ably accounts stats
```

Get stats with specific time unit:

```
ably accounts stats --unit hour
```

Get stats for a specific period:

```
ably accounts stats --start 1618005600000 --end 1618091999999
```

Limit the number of returned records:

```
ably accounts stats --limit 10
```

Get stats in JSON format:

```
ably accounts stats --format json
```

Subscribe to live stats updates:

```
ably accounts stats --live
```

Subscribe to live stats with custom polling interval:

```
ably accounts stats --live --interval 15
```

## Metrics Shown

The command displays the following metrics:

- **Messages**: Published and delivered count, data volume, and peak message rate (per second)
- **Connections**: Peak, mean, opened count, and peak connection rate (per second)
- **Channels**: Peak, mean, opened count, and peak channel rate (per second) if available
- **API Requests**: Succeeded, failed, refused count, and peak API request rate (per second) if available
- **Token Requests**: Succeeded, failed, refused count, and peak token request rate (per second)
- **Integrations**: Peak rates for various integration types (HTTP Events, AMQP, External Queue, Webhook) if available
- **Push Notifications**: Messages sent, delivery status, and peak push request rate (per second) if available

Peak rates are reported per second and values between 0 and 1 are displayed with one decimal place for clarity.
