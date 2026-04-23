# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                # Install dependencies
npm start                  # Start server on http://localhost:3001
node test_no_auth.js       # Verify all 3 GraphQL queries work without credentials
node test_incremental.js   # Test incremental refresh + save-summary (server must be running)
node test_prob.js          # Test problem endpoint (two-sum slug)
node test_sort.js          # Test sorting/filtering
```

There is no build step — the Express server serves `public/` as static files directly.

To clear the local database (e.g. to force a fresh full fetch):
```bash
node -e "const D=require('better-sqlite3');const d=new D('leetcode.db');d.exec('DELETE FROM posts;DELETE FROM post_details;DELETE FROM company_fetches;DELETE FROM problems;');d.close();"
```

## Environment

Copy `.env.example` to `.env`. The only required variable is:
- `SUMMARY_DIR` — directory where summary `.txt` files are saved (default: `./summaries`, created automatically)

`LEETCODE_SESSION` and `CSRF_TOKEN` are present in `.env.example` as legacy placeholders but are **not required** — all LeetCode GraphQL endpoints used here work without authentication.

## Architecture

**Backend** ([server.js](server.js)): Express server on port 3001. Proxies three LeetCode GraphQL queries, with two caching layers: in-memory `node-cache` (5-min TTL) and SQLite via [db.js](db.js).

**Database** ([db.js](db.js)): SQLite (`leetcode.db`) with four tables: `posts`, `post_details`, `company_fetches`, `problems`. Company filtering is done via `tags LIKE '%"company"%'` JSON string matching. `meta` is special-cased to match both `facebook` and `meta` tags.

**Frontend** ([public/](public/)): Vanilla JS SPA. Two-panel layout: post list (left) + detail view (right). Uses `marked.js` and `jsPDF` from CDN. No bundler.

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/posts` | Paginated list. Params: `company`, `page`, `pageSize`, `orderBy`, `search`, `year`, `tag` |
| `GET /api/posts/:topicId` | Full post content. Checks cache → DB → LeetCode |
| `GET /api/problem/:slug` | Problem details. Checks cache → DB → LeetCode |
| `POST /api/refresh` | Incremental fetch — only posts newer than `MAX(created_at)` in DB. First run triggers full fetch of all pages |
| `POST /api/save-summary` | Body: `{ company, postIds[] }`. Fetches full content per post, strips HTML, writes `.txt` to `SUMMARY_DIR` |
| `GET /api/export-posts` | Downloads all posts for a company as `.txt` (DB only, no web calls) |
| `GET /api/years` | Distinct years available in DB for a company |
| `GET /api/health` | Health check |

### Data Flow

**First load for a company**: `/api/posts` detects no `company_fetches` row → calls `fetchAllPagesForCompany()` → fetches all pages (BATCH_SIZE=50) from LeetCode, upserts to DB, writes `company_fetches` row with `last_fetched_at` and `total_num`.

**Subsequent loads**: served directly from SQLite (`getPostsByCompany()`). Search queries always bypass DB and hit LeetCode directly.

**Refresh (incremental)**: `POST /api/refresh` checks for existing `company_fetches` row. If present, calls `fetchNewPostsForCompany()` which queries `MAX(created_at)` from DB, fetches pages from LeetCode, stops when a full page has zero posts newer than the cutoff (safety cap: 20 pages). Returns `{ newPosts, newCount }` — frontend shows summary modal if `newCount > 0`.

**Summary modal**: After refresh finds new posts, a modal lists them. "Save Summary" calls `POST /api/save-summary`, which fetches full content for each post, strips HTML, and writes a `.txt` file to `SUMMARY_DIR`.

**Export Posts button**: Opens a modal with a progress bar. Fetches all post metadata page by page, then fetches full content for each post via `/api/posts/:id`, then downloads a single `.txt` file client-side.

### Cache Keys
- Posts list: `posts_${company}_${page}_${pageSize}_${orderBy}_${search}_${year}_${tag}`
- Post detail: `post_${topicId}`
- Problem: `problem_${titleSlug}`

### Valid GraphQL `orderBy` values
The `ArticleOrderByEnum` accepts uppercase values: `HOT`, `NEWEST_TO_OLDEST` (may vary). The server omits `orderBy` in most queries, relying on LeetCode's default ordering. The frontend sends `newest_to_oldest` as a UI label but this is only used for DB queries — it is **not** forwarded to LeetCode.
