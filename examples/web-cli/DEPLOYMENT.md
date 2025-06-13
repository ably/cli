# Deploying the Ably Web CLI Example to Vercel

This guide explains how to deploy the Ably Web CLI example application to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed (optional): `npm i -g vercel`

## Deployment Steps

### Option 1: Deploy via GitHub (Recommended)

1. Push your changes to GitHub
2. Go to https://vercel.com/new
3. Import your GitHub repository
4. Set the Root Directory to `examples/web-cli` in the import settings
5. Vercel will automatically detect the configuration from `vercel.json`
6. Click "Deploy"

### Option 2: Deploy via CLI

1. Install Vercel CLI: `npm i -g vercel`
2. Navigate to the examples/web-cli directory: `cd examples/web-cli`
3. Run: `vercel`
4. Follow the prompts

## Configuration

The deployment is configured via `vercel.json` in the `examples/web-cli` directory:

```json
{
  "buildCommand": "cd ../.. && pnpm install && pnpm build:packages && cd examples/web-cli && pnpm build",
  "outputDirectory": "dist",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## Environment Variables

To use custom Ably credentials in the deployed version, set these environment variables in Vercel:

- `VITE_ABLY_API_KEY`: Your Ably API key
- `VITE_ABLY_ACCESS_TOKEN`: Your Ably access token (optional)
- `VITE_TERMINAL_SERVER_URL`: Custom WebSocket server URL (optional, defaults to wss://web-cli.ably.com)

### Setting Environment Variables

1. Go to your project settings in Vercel
2. Navigate to "Environment Variables"
3. Add the variables with their values
4. Redeploy for changes to take effect

## Build Process

The build process:
1. Installs all dependencies using pnpm
2. Builds the React Web CLI package
3. Builds the example application
4. Outputs static files to `examples/web-cli/dist`

## Troubleshooting

### Build Failures

If the build fails:
1. Check the build logs in Vercel
2. Ensure all dependencies are properly listed in package.json files
3. Verify that the `@ably/react-web-cli` workspace dependency is building correctly

### Large Bundle Size

The application includes xterm.js and its addons, which results in a larger bundle. This is expected for a terminal application.

## URL Parameters

The deployed app supports these URL parameters:
- `?serverUrl=ws://localhost:8080` - Connect to a custom WebSocket server
- `?apiKey=your-api-key` - Use a specific API key
- `?accessToken=your-token` - Use a specific access token
- `?mode=drawer` - Start in drawer mode instead of fullscreen