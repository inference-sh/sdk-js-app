---
description: "Weekly: AI code review of the last 7 days on dev"
on:
  schedule: weekly on monday
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: read

engine:
  id: claude

runtimes:
  node:
    version: "22"

network:
  allowed:
    - node

steps:
  - name: Save commit range (last 7 days)
    run: |
      git fetch --quiet --unshallow origin 2>/dev/null || git fetch --quiet --shallow-since="10 days ago" origin "$(git rev-parse --abbrev-ref HEAD)" || true
      BASE=$(git rev-list -1 --before="7 days ago" HEAD 2>/dev/null || true)
      [ -z "$BASE" ] && BASE=$(git rev-list --max-parents=0 HEAD | tail -1)
      echo "${BASE}..HEAD" > /tmp/gh-aw/commit-range.txt
      git log --oneline "${BASE}..HEAD" > /tmp/gh-aw/commit-log.txt 2>&1 || true
      git diff "${BASE}..HEAD" > /tmp/gh-aw/commit-diff.txt 2>&1 || true
  - name: Install and build
    run: |
      npm ci 2>&1 || npm install 2>&1 || true
      npm run build 2>&1 || true
    continue-on-error: true
  - name: Run tests
    run: |
      npm test > /tmp/gh-aw/test-results.txt 2>&1 || true
    continue-on-error: true

safe-outputs:
  noop:
    report-as-issue: false
  create-pull-request:
    base-branch: dev
    title-prefix: "[code-review] "
    labels: [code-review, ai]
    reviewers: [okaris]
    max: 5

timeout-minutes: 30
---

# Weekly Code Review

You are an expert code reviewer for a TypeScript SDK package. Review pushed code for patterns/antipatterns.

## Step 1: Check Test Results

```bash
cat /tmp/gh-aw/test-results.txt
```

Fix any test failures first.

## Step 2: Read the Diff

```bash
cat /tmp/gh-aw/commit-range.txt
cat /tmp/gh-aw/commit-log.txt
cat /tmp/gh-aw/commit-diff.txt
```

**Before opening anything, list the open issues and pull requests labelled `code-review` in this repository and skip any finding already reported there.**

**Only review code from the commit diff. Do not scan unrelated parts of the repository.**

If the diff is empty, use the noop tool.

## Step 3: Review

- Compare against existing patterns in the repo
- Check for unused imports, dead code, missing error handling
- Check TypeScript types (avoid `any`, proper generics)
- Check for breaking API surface changes
- Flag security issues (hardcoded secrets, unsafe input handling)

## Output

Open **separate PRs** for each independent fix. Only fix things you're confident about.
