// db.js — SQLite persistence layer
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'leetcode.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    comment_count     INTEGER DEFAULT 0,
    view_count        INTEGER DEFAULT 0,
    vote_count        INTEGER DEFAULT 0,
    created_at        TEXT,
    author            TEXT,
    author_avatar     TEXT,
    author_reputation INTEGER DEFAULT 0,
    url               TEXT,
    tags              TEXT,
    fetched_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_details (
    id         TEXT PRIMARY KEY,
    content    TEXT,
    updated_at TEXT,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_fetches (
    company         TEXT PRIMARY KEY,
    last_fetched_at INTEGER NOT NULL,
    total_num       INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS problems (
    slug       TEXT PRIMARY KEY,
    problem_id TEXT,
    title      TEXT,
    difficulty TEXT,
    content    TEXT,
    url        TEXT,
    fetched_at INTEGER NOT NULL
  );
`);

// ── Prepared statements ─────────────────────────────────────────
const stmts = {
  upsertPost: db.prepare(`
    INSERT INTO posts (id, title, comment_count, view_count, vote_count,
                       created_at, author, author_avatar, author_reputation,
                       url, tags, fetched_at)
    VALUES (@id, @title, @comment_count, @view_count, @vote_count,
            @created_at, @author, @author_avatar, @author_reputation,
            @url, @tags, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title             = excluded.title,
      comment_count     = excluded.comment_count,
      view_count        = excluded.view_count,
      vote_count        = excluded.vote_count,
      created_at        = excluded.created_at,
      author            = excluded.author,
      author_avatar     = excluded.author_avatar,
      url               = excluded.url,
      tags              = excluded.tags,
      fetched_at        = excluded.fetched_at
  `),

  upsertPostDetail: db.prepare(`
    INSERT INTO post_details (id, content, updated_at, fetched_at)
    VALUES (@id, @content, @updated_at, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      content    = excluded.content,
      updated_at = excluded.updated_at,
      fetched_at = excluded.fetched_at
  `),

  upsertCompanyFetch: db.prepare(`
    INSERT INTO company_fetches (company, last_fetched_at, total_num)
    VALUES (@company, @last_fetched_at, @total_num)
    ON CONFLICT(company) DO UPDATE SET
      last_fetched_at = excluded.last_fetched_at,
      total_num       = excluded.total_num
  `),

  upsertProblem: db.prepare(`
    INSERT INTO problems (slug, problem_id, title, difficulty, content, url, fetched_at)
    VALUES (@slug, @problem_id, @title, @difficulty, @content, @url, @fetched_at)
    ON CONFLICT(slug) DO UPDATE SET
      problem_id = excluded.problem_id,
      title      = excluded.title,
      difficulty = excluded.difficulty,
      content    = excluded.content,
      url        = excluded.url,
      fetched_at = excluded.fetched_at
  `),

  getCompanyFetch: db.prepare(
    `SELECT * FROM company_fetches WHERE company = ?`
  ),

  getPostDetail: db.prepare(`
    SELECT p.*, pd.content, pd.updated_at AS detail_updated_at
    FROM posts p
    JOIN post_details pd ON p.id = pd.id
    WHERE p.id = ?
  `),

  getProblem: db.prepare(
    `SELECT * FROM problems WHERE slug = ?`
  ),

  deleteCompanyFetch: db.prepare(
    `DELETE FROM company_fetches WHERE company = ?`
  ),
};

// ── Batch upsert posts in a single transaction ──────────────────
const upsertPostsBatch = db.transaction(function(posts) {
  var now = Date.now();
  for (var i = 0; i < posts.length; i++) {
    var p = posts[i];
    stmts.upsertPost.run({
      id:                String(p.id),
      title:             p.title,
      comment_count:     p.commentCount || 0,
      view_count:        p.viewCount || 0,
      vote_count:        p.voteCount || 0,
      created_at:        p.createdAt || null,
      author:            p.author || 'Anonymous',
      author_avatar:     p.authorAvatar || null,
      author_reputation: p.authorReputation || 0,
      url:               p.url || null,
      tags:              JSON.stringify(p.tags || []),
      fetched_at:        now,
    });
  }
});

// ── Query posts for a company from DB ──────────────────────────
function getPostsByCompany(company, page, pageSize, orderBy, year, tagFilter) {
  var orderClause;
  if (orderBy === 'most_voted')         orderClause = 'vote_count DESC';
  else if (orderBy === 'most_relevant') orderClause = 'view_count DESC';
  else                                  orderClause = 'created_at DESC';

  var yearClause = year      ? ' AND strftime(\'%Y\', created_at) = ?' : '';
  var tagClause  = tagFilter ? ' AND tags LIKE \'%"' + tagFilter + '"%\'' : '';

  var rows;
  if (company === 'meta') {
    var sql = 'SELECT * FROM posts WHERE (tags LIKE \'%"facebook"%\' OR tags LIKE \'%"meta"%\')' +
              yearClause + tagClause + ' ORDER BY ' + orderClause + ' LIMIT ? OFFSET ?';
    rows = year
      ? db.prepare(sql).all(year, pageSize, page * pageSize)
      : db.prepare(sql).all(pageSize, page * pageSize);
  } else {
    var tagPattern = '%"' + company + '"%';
    var sql2 = 'SELECT * FROM posts WHERE tags LIKE ?' + yearClause + tagClause +
               ' ORDER BY ' + orderClause + ' LIMIT ? OFFSET ?';
    rows = year
      ? db.prepare(sql2).all(tagPattern, year, pageSize, page * pageSize)
      : db.prepare(sql2).all(tagPattern, pageSize, page * pageSize);
  }

  return rows.map(function(row) {
    return {
      id:               row.id,
      title:            row.title,
      commentCount:     row.comment_count,
      viewCount:        row.view_count,
      voteCount:        row.vote_count,
      createdAt:        row.created_at,
      author:           row.author,
      authorAvatar:     row.author_avatar,
      authorReputation: row.author_reputation,
      url:              row.url,
      tags:             JSON.parse(row.tags || '[]'),
    };
  });
}

// Count posts for a company (with optional year filter) — used for totalNum when year is active
function countPostsByCompany(company, year, tagFilter) {
  var yearClause = year      ? ' AND strftime(\'%Y\', created_at) = ?' : '';
  var tagClause  = tagFilter ? ' AND tags LIKE \'%"' + tagFilter + '"%\'' : '';
  if (company === 'meta') {
    var sql = 'SELECT COUNT(*) AS cnt FROM posts WHERE (tags LIKE \'%"facebook"%\' OR tags LIKE \'%"meta"%\')' + yearClause + tagClause;
    return (year ? db.prepare(sql).get(year) : db.prepare(sql).get()).cnt;
  }
  var tagPattern = '%"' + company + '"%';
  var sql2 = 'SELECT COUNT(*) AS cnt FROM posts WHERE tags LIKE ?' + yearClause + tagClause;
  return (year ? db.prepare(sql2).get(tagPattern, year) : db.prepare(sql2).get(tagPattern)).cnt;
}

// Return distinct years available in DB for a company
function getAvailableYears(company) {
  if (company === 'meta') {
    return db.prepare(
      `SELECT DISTINCT strftime('%Y', created_at) AS yr FROM posts
       WHERE (tags LIKE '%"facebook"%' OR tags LIKE '%"meta"%')
         AND created_at IS NOT NULL
       ORDER BY yr DESC`
    ).all().map(function(r) { return r.yr; });
  }
  return db.prepare(
    `SELECT DISTINCT strftime('%Y', created_at) AS yr FROM posts
     WHERE tags LIKE ? AND created_at IS NOT NULL
     ORDER BY yr DESC`
  ).all('%"' + company + '"%').map(function(r) { return r.yr; });
}

// Return the ISO created_at of the newest post stored for a company
function getNewestPostDate(company) {
  var row;
  if (company === 'meta') {
    row = db.prepare(
      `SELECT MAX(created_at) AS latest FROM posts WHERE tags LIKE '%"facebook"%' OR tags LIKE '%"meta"%'`
    ).get();
  } else {
    row = db.prepare(
      `SELECT MAX(created_at) AS latest FROM posts WHERE tags LIKE ?`
    ).get('%"' + company + '"%');
  }
  return row ? row.latest : null;
}

// LEFT JOIN posts + post_details for the first N posts of a company (for file export)
function getPostsWithContent(company, year, limit, tagFilter) {
  var yearClause = year      ? ' AND strftime(\'%Y\', p.created_at) = ?' : '';
  var tagClause  = tagFilter ? ' AND p.tags LIKE \'%"' + tagFilter + '"%\'' : '';
  var sql, rows;
  if (company === 'meta') {
    sql = `SELECT p.*, pd.content FROM posts p
           LEFT JOIN post_details pd ON p.id = pd.id
           WHERE (p.tags LIKE '%"facebook"%' OR p.tags LIKE '%"meta"%')` +
           yearClause + tagClause + ` ORDER BY p.created_at DESC LIMIT ?`;
    rows = year ? db.prepare(sql).all(year, limit) : db.prepare(sql).all(limit);
  } else {
    var tagPattern = '%"' + company + '"%';
    sql = `SELECT p.*, pd.content FROM posts p
           LEFT JOIN post_details pd ON p.id = pd.id
           WHERE p.tags LIKE ?` + yearClause + tagClause +
           ` ORDER BY p.created_at DESC LIMIT ?`;
    rows = year ? db.prepare(sql).all(tagPattern, year, limit) : db.prepare(sql).all(tagPattern, limit);
  }
  return rows.map(function(row) {
    return {
      id:        row.id,
      title:     row.title,
      author:    row.author,
      createdAt: row.created_at,
      tags:      JSON.parse(row.tags || '[]'),
      url:       row.url,
      content:   row.content || null,
    };
  });
}

module.exports = { stmts, upsertPostsBatch, getPostsByCompany, countPostsByCompany, getAvailableYears, getPostsWithContent, getNewestPostDate };
