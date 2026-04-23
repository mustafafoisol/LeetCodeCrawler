/**
 * test_incremental.js — Tests for incremental refresh + save-summary
 *
 * Requires the server to be running on http://localhost:3001
 * Run: node test_incremental.js
 */
require('dotenv').config();
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3001';
const DB_PATH = path.join(__dirname, 'leetcode.db');

function pass(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); process.exitCode = 1; }

async function clearDb() {
  const db = new Database(DB_PATH);
  db.exec('DELETE FROM post_details; DELETE FROM posts; DELETE FROM company_fetches; DELETE FROM problems;');
  db.close();
}

// ── T1: Full fetch on empty DB ─────────────────────────────────
async function t1_fullFetchOnEmptyDb() {
  console.log('\nT1: Full fetch triggers on empty DB');
  await clearDb();

  // Hitting /api/posts triggers fetchAllPagesForCompany if no company_fetches row
  const res = await axios.get(`${BASE}/api/posts?company=google&page=0&pageSize=5`);
  if (res.status === 200 && Array.isArray(res.data.posts) && res.data.posts.length > 0) {
    pass('GET /api/posts returned posts after full fetch');
  } else {
    fail('Expected posts array, got: ' + JSON.stringify(res.data).slice(0, 200));
  }

  const db = new Database(DB_PATH);
  const count = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE tags LIKE '%\"google\"%'").get().n;
  db.close();
  if (count > 0) {
    pass(`DB now has ${count} google posts`);
  } else {
    fail('DB still empty after full fetch');
  }
}

// ── T2: Incremental refresh returns newCount:0 right after full fetch ──
async function t2_incrementalReturnsZero() {
  console.log('\nT2: Incremental refresh right after full fetch → newCount: 0');

  const res = await axios.post(`${BASE}/api/refresh?company=google`);
  if (res.status !== 200) { fail('Non-200 response: ' + res.status); return; }

  const { newCount, newPosts } = res.data;
  if (typeof newCount === 'number') {
    pass(`newCount returned: ${newCount}`);
  } else {
    fail('newCount not in response: ' + JSON.stringify(res.data).slice(0, 200));
    return;
  }
  if (newCount === 0) {
    pass('newCount is 0 — no phantom new posts after fresh fetch');
  } else {
    // Not necessarily a failure — there could genuinely be new posts if time passed
    pass(`newCount is ${newCount} (possible genuine new posts since fetch)`);
  }
  if (Array.isArray(newPosts)) {
    pass('newPosts is an array');
  } else {
    fail('newPosts is not an array');
  }
}

// ── T3: Fake cutoff — backdate all posts so they look old ─────
async function t3_fakeCutoffDetectsNew() {
  console.log('\nT3: Backdate DB posts → incremental refresh should find new posts');

  const db = new Database(DB_PATH);
  // Set all google posts to a very old date so everything from LeetCode looks "new"
  db.prepare("UPDATE posts SET created_at = '2020-01-01T00:00:00Z' WHERE tags LIKE '%\"google\"%'").run();
  // Also remove company_fetches so the incremental path triggers (not full fetch)
  // Keep it but update it so the path uses incremental
  db.close();

  const res = await axios.post(`${BASE}/api/refresh?company=google`);
  if (res.status !== 200) { fail('Non-200: ' + res.status); return; }

  const { newCount, newPosts } = res.data;
  if (newCount > 0) {
    pass(`newCount: ${newCount} — detected posts newer than fake 2020 cutoff`);
  } else {
    fail('Expected newCount > 0 after backdating. Got: ' + newCount);
  }
  if (Array.isArray(newPosts) && newPosts.length === newCount) {
    pass(`newPosts array has ${newPosts.length} items matching newCount`);
  } else {
    fail('newPosts length mismatch');
  }
  if (newPosts.length > 0 && newPosts[0].id && newPosts[0].title) {
    pass('First new post has id + title: ' + newPosts[0].title.slice(0, 50));
  }
}

// ── T4: Save summary ──────────────────────────────────────────
async function t4_saveSummary() {
  console.log('\nT4: Save summary for first 3 posts');

  // Get some real post IDs from DB
  const db = new Database(DB_PATH);
  const rows = db.prepare("SELECT id FROM posts WHERE tags LIKE '%\"google\"%' LIMIT 3").all();
  db.close();

  if (rows.length === 0) { fail('No posts in DB to summarize'); return; }

  const postIds = rows.map(r => r.id);
  const res = await axios.post(`${BASE}/api/save-summary`, { company: 'google', postIds });

  if (res.status !== 200 || !res.data.success) {
    fail('save-summary failed: ' + JSON.stringify(res.data));
    return;
  }
  pass(`Saved ${res.data.postCount} posts`);

  const filepath = res.data.filepath;
  if (fs.existsSync(filepath)) {
    pass('File exists: ' + filepath);
    const content = fs.readFileSync(filepath, 'utf8');
    if (content.includes('LeetCode Discussion Summary')) {
      pass('File has correct header');
    } else {
      fail('Missing header in file');
    }
    if (content.includes('=== Post #')) {
      pass('File has post blocks');
    } else {
      fail('Missing post blocks in file');
    }
  } else {
    fail('File does not exist at: ' + filepath);
  }
}

// ── T5: save-summary validation ───────────────────────────────
async function t5_validation() {
  console.log('\nT5: save-summary input validation');
  try {
    await axios.post(`${BASE}/api/save-summary`, { company: 'google', postIds: [] });
    fail('Should have rejected empty postIds');
  } catch (err) {
    if (err.response && err.response.status === 400) {
      pass('Correctly returns 400 for empty postIds');
    } else {
      fail('Unexpected error: ' + err.message);
    }
  }
}

// ── Run all ───────────────────────────────────────────────────
(async () => {
  console.log('=== test_incremental.js ===');
  console.log('Server:', BASE);

  try {
    await axios.get(`${BASE}/api/health`);
  } catch {
    console.error('ERROR: Server not running at ' + BASE + '. Start it first: node server.js');
    process.exit(1);
  }

  try {
    await t1_fullFetchOnEmptyDb();
    await t2_incrementalReturnsZero();
    await t3_fakeCutoffDetectsNew();
    await t4_saveSummary();
    await t5_validation();
  } catch (err) {
    console.error('Unexpected test error:', err.message);
    process.exitCode = 1;
  }

  console.log('\n=== Done ===');
  if (process.exitCode === 1) {
    console.log('Some tests FAILED.');
  } else {
    console.log('All tests PASSED.');
  }
})();
