# LeetCode Interview Experience Crawler

A local web app that fetches and browses real interview experience posts from LeetCode Discuss, filtered by company. Supports incremental refresh, full-text search, PDF export, and saving summaries to disk — no LeetCode account required.

## Features

- Browse interview experiences by company (Google, Meta/Facebook, Amazon, etc.)
- Filter by year, tag, and keyword search
- Read full post content in a two-panel SPA
- Incremental refresh — only fetches posts newer than what's already cached
- Export all posts for a company as a `.txt` file
- Save a `.txt` summary of selected posts to a local directory
- Two-layer cache: in-memory (5-min TTL) + SQLite for persistence across restarts

## Quick Start

```bash
npm install
cp .env.example .env   # edit SUMMARY_DIR if needed
npm start              # http://localhost:3001
```

No LeetCode account is needed. `LEETCODE_SESSION` and `CSRF_TOKEN` in `.env` are legacy placeholders and can be left as-is.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SUMMARY_DIR` | `./summaries` | Directory where summary `.txt` files are written (auto-created) |
| `LEETCODE_SESSION` | _(unused)_ | Legacy — not required |
| `CSRF_TOKEN` | _(unused)_ | Legacy — not required |

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/posts` | Paginated list. Params: `company`, `page`, `pageSize`, `orderBy`, `search`, `year`, `tag` |
| `GET /api/posts/:topicId` | Full post content (cache → DB → LeetCode) |
| `GET /api/problem/:slug` | Problem details by slug (cache → DB → LeetCode) |
| `POST /api/refresh` | Incremental fetch — only posts newer than `MAX(created_at)` in DB |
| `POST /api/save-summary` | Body: `{ company, postIds[] }`. Fetches content, strips HTML, writes `.txt` |
| `GET /api/export-posts` | Download all posts for a company as `.txt` (DB only) |
| `GET /api/years` | Distinct years available in DB for a company |
| `GET /api/health` | Health check |

## Database

SQLite (`leetcode.db`) — created automatically on first run. Four tables: `posts`, `post_details`, `company_fetches`, `problems`.

To wipe the database and force a full re-fetch:

```bash
node -e "const D=require('better-sqlite3');const d=new D('leetcode.db');d.exec('DELETE FROM posts;DELETE FROM post_details;DELETE FROM company_fetches;DELETE FROM problems;');d.close();"
```

## Project Structure

```
server.js        # Express server + LeetCode GraphQL proxy
db.js            # SQLite schema and query helpers
public/
  index.html     # SPA shell
  app.js         # Vanilla JS frontend
  style.css      # Styles
test_no_auth.js      # Verify all 3 GraphQL queries work without credentials
test_incremental.js  # Test incremental refresh (server must be running)
test_prob.js         # Test /api/problem/:slug
test_sort.js         # Test sorting and filtering
```

## Tech Stack

- **Backend**: Node.js, Express, axios, better-sqlite3, node-cache
- **Frontend**: Vanilla JS, marked.js (CDN), jsPDF (CDN) — no bundler
- **Data source**: LeetCode GraphQL API (`/graphql`) — public, no auth required
