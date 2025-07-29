# AI Assistant: START HERE

You MUST read and follow: `.claude/CLAUDE.md`

Run this command first:
```bash
cat .claude/CLAUDE.md
```

## Important Notes

- This is the Ably CLI npm package (@ably/cli)
- Follow the MANDATORY workflow for ALL code changes:
  ```bash
  pnpm prepare        # 1. Build + update manifest/README
  pnpm exec eslint .  # 2. Lint (MUST be 0 errors)
  pnpm test:unit      # 3. Test (at minimum)
  ```
- Read `.cursor/rules/*.mdc` files for detailed guidance
- **If you skip these steps, the work is NOT complete**