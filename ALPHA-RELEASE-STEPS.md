# Alpha Release Steps for v0.9.0-alpha.1

## Pre-flight checks ✅
- Version updated to 0.9.0-alpha.1
- Alpha warnings added to interactive mode
- Both wrapper scripts (bash and PowerShell) included
- oclif manifest regenerated

## Publishing steps:

1. **Login to npm (if not already logged in):**
   ```bash
   npm login
   ```

2. **Publish with alpha tag:**
   ```bash
   npm publish --tag alpha
   ```
   
   **Important:** Use `--tag alpha` to avoid this being tagged as 'latest'

3. **Verify the release:**
   ```bash
   npm view @ably/cli@alpha
   ```

## Testing the alpha release:

Install specifically the alpha version:
```bash
npm install -g @ably/cli@alpha
```

Test the new interactive mode:
```bash
ably-interactive
```

## Notes:
- This alpha release will NOT trigger auto-updates for existing CLI users
- Only users who explicitly install `@ably/cli@alpha` will get this version
- The 'latest' tag remains at 0.8.2
- Interactive mode shows "(ALPHA VERSION)" warning

## To revert if needed:
```bash
npm install -g @ably/cli@latest
```