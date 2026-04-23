require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs');

const db = require('./db');

const app = express();
const cache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';
const SUMMARY_DIR = process.env.SUMMARY_DIR || './summaries';

const HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://leetcode.com/discuss/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': 'https://leetcode.com',
};

// Query to list discussion posts filtered by tag/category (new ugc API)
const POSTS_LIST_QUERY = `
query discussPostItems($orderBy: ArticleOrderByEnum, $keywords: [String]!, $tagSlugs: [String!], $skip: Int, $first: Int) {
  ugcArticleDiscussionArticles(
    orderBy: $orderBy
    keywords: $keywords
    tagSlugs: $tagSlugs
    skip: $skip
    first: $first
  ) {
    totalNum
    pageInfo {
      hasNextPage
    }
    edges {
      node {
        uuid
        title
        slug
        summary
        topicId
        hitCount
        createdAt
        reactions {
          count
          reactionType
        }
        tags {
          name
          slug
        }
        author {
          userName
          userAvatar
          userSlug
        }
        topic {
          id
          topLevelCommentCount
        }
      }
    }
  }
}
`;

// Query to get full post content (new ugc API)
const POST_DETAIL_QUERY = `
query ugcArticleDiscussionArticle($topicId: ID!) {
  ugcArticleDiscussionArticle(topicId: $topicId) {
    uuid
    title
    slug
    content
    createdAt
    updatedAt
    hitCount
    reactions {
      count
      reactionType
    }
    tags {
      name
      slug
    }
    author {
      userName
      userAvatar
    }
    topic {
      id
      topLevelCommentCount
    }
  }
}
`;

// Query to get problem data
const PROBLEM_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    titleSlug
    content
    difficulty
  }
}
`;

// ── Helpers ─────────────────────────────────────────────────────

// Fetch a single page from LeetCode and return { totalNum, posts }
async function fetchOnePage(company, page, pageSize, search) {
  const companySlugs = company === 'meta' ? ['facebook', 'meta'] : [company];
  const variables = {
    first: pageSize,
    skip: page * pageSize,
    tagSlugs: companySlugs,
    keywords: [search || ''],
  };

  const response = await axios.post(
    LEETCODE_GRAPHQL,
    { query: POSTS_LIST_QUERY, variables, operationName: 'discussPostItems' },
    { headers: HEADERS, timeout: 15000 }
  );

  const data = response.data;
  if (data.errors) throw new Error('LeetCode GraphQL error: ' + JSON.stringify(data.errors));

  const list = data.data && data.data.ugcArticleDiscussionArticles;
  if (!list) throw new Error('Unexpected response from LeetCode');

  const posts = list.edges.map(function(edge) {
    var node = edge.node;
    var author = node.author || {};
    var topic = node.topic || {};
    var voteCount = (node.reactions || []).reduce(function(sum, r) {
      return sum + (r.count || 0);
    }, 0);
    var topicId = node.topicId || topic.id;
    return {
      id: topicId,
      title: node.title,
      commentCount: topic.topLevelCommentCount || 0,
      viewCount: node.hitCount || 0,
      tags: node.tags ? node.tags.map(function(t) { return t.name; }) : [],
      voteCount: voteCount,
      createdAt: node.createdAt || null,
      author: author.userName || 'Anonymous',
      authorAvatar: author.userAvatar || null,
      authorReputation: 0,
      url: 'https://leetcode.com/discuss/' + (node.slug || topicId),
    };
  });

  return { totalNum: list.totalNum, posts };
}

// Fetch ALL pages for a company from LeetCode and persist to DB
async function fetchAllPagesForCompany(company) {
  const BATCH_SIZE = 50;

  console.log(`[DB] Fetching all pages for company: ${company}`);
  const first = await fetchOnePage(company, 0, BATCH_SIZE, '');
  db.upsertPostsBatch(first.posts);

  const totalPages = Math.ceil(first.totalNum / BATCH_SIZE);
  console.log(`[DB] ${first.totalNum} posts across ${totalPages} pages — fetching...`);

  for (var p = 1; p < totalPages; p++) {
    try {
      const page = await fetchOnePage(company, p, BATCH_SIZE, '');
      db.upsertPostsBatch(page.posts);
      if (p % 10 === 0) console.log(`[DB] ${company}: fetched ${p}/${totalPages} pages`);
    } catch (err) {
      console.error(`[DB] Failed page ${p} for ${company}:`, err.message);
    }
  }

  db.stmts.upsertCompanyFetch.run({
    company,
    last_fetched_at: Date.now(),
    total_num: first.totalNum,
  });

  console.log(`[DB] Done — ${first.totalNum} posts stored for ${company}`);
}

// Fetch only posts newer than what's already in DB for this company.
// Returns array of new post objects (same shape as fetchOnePage).
async function fetchNewPostsForCompany(company) {
  const BATCH_SIZE = 50;
  const MAX_PAGES = 20; // safety cap — 1000 posts max per incremental run

  const cutoff = db.getNewestPostDate(company);
  if (!cutoff) {
    // No data yet — fall back to full fetch
    await fetchAllPagesForCompany(company);
    return [];
  }

  const cutoffDate = new Date(cutoff);
  const allNew = [];

  for (var p = 0; p < MAX_PAGES; p++) {
    const { totalNum, posts } = await fetchOnePage(company, p, BATCH_SIZE, '');

    const newOnPage = posts.filter(function(post) {
      return post.createdAt && new Date(post.createdAt) > cutoffDate;
    });

    allNew.push.apply(allNew, newOnPage);

    // If the whole page is older than the cutoff, we're done
    if (newOnPage.length === 0) break;

    // Update totalNum in company_fetches with the freshest count
    if (p === 0) {
      db.stmts.upsertCompanyFetch.run({
        company,
        last_fetched_at: Date.now(),
        total_num: totalNum,
      });
    }
  }

  if (allNew.length > 0) {
    db.upsertPostsBatch(allNew);
    console.log(`[incremental] ${company}: ${allNew.length} new posts stored`);
  } else {
    // Still update the fetch timestamp
    const meta = db.stmts.getCompanyFetch.get(company);
    db.stmts.upsertCompanyFetch.run({
      company,
      last_fetched_at: Date.now(),
      total_num: meta ? meta.total_num : 0,
    });
    console.log(`[incremental] ${company}: no new posts found`);
  }

  return allNew;
}

// ── GET /api/posts ───────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  const page = parseInt(req.query.page) || 0;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const orderBy = req.query.orderBy || 'newest_to_oldest';
  const search = req.query.search || '';
  const company = req.query.company || 'google';
  const year = req.query.year || '';
  const tag  = req.query.tag  || '';

  const cacheKey = `posts_${company}_${page}_${pageSize}_${orderBy}_${search}_${year}_${tag}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  // Search always goes directly to LeetCode (can't replicate server-side FTS locally)
  if (search) {
    try {
      const { totalNum, posts } = await fetchOnePage(company, page, pageSize, search);
      const result = { totalNum, page, pageSize, posts };
      cache.set(cacheKey, result);
      return res.json(result);
    } catch (err) {
      console.error('Error fetching search results:', err.message);
      return res.status(500).json({ error: 'Failed to fetch posts', message: err.message });
    }
  }

  // Non-search: fetch ALL pages on first visit, then always serve from DB
  try {
    const companyRow = db.stmts.getCompanyFetch.get(company);
    if (!companyRow) {
      await fetchAllPagesForCompany(company);
    }

    const posts = db.getPostsByCompany(company, page, pageSize, orderBy, year, tag);
    const meta = db.stmts.getCompanyFetch.get(company);
    const totalNum = (year || tag) ? db.countPostsByCompany(company, year, tag) : meta.total_num;
    const result = { totalNum, page, pageSize, posts };
    cache.set(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error('Error fetching posts:', err.message);
    return res.status(500).json({ error: 'Failed to fetch posts', message: err.message });
  }
});

// GET /api/posts/:topicId
app.get('/api/posts/:topicId', async (req, res) => {
  const topicId = req.params.topicId;
  if (!topicId) return res.status(400).json({ error: 'Invalid topic ID' });

  const cacheKey = `post_${topicId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  // Layer 2: DB
  const dbRow = db.stmts.getPostDetail.get(topicId);
  if (dbRow) {
    const result = {
      id:               dbRow.id,
      title:            dbRow.title,
      viewCount:        dbRow.view_count,
      commentCount:     dbRow.comment_count,
      tags:             JSON.parse(dbRow.tags || '[]'),
      voteCount:        dbRow.vote_count,
      content:          dbRow.content || '',
      createdAt:        dbRow.created_at,
      updatedAt:        dbRow.detail_updated_at || null,
      author:           dbRow.author,
      authorAvatar:     dbRow.author_avatar,
      authorReputation: dbRow.author_reputation,
      url:              dbRow.url,
    };
    cache.set(cacheKey, result);
    return res.json(result);
  }

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL,
      { query: POST_DETAIL_QUERY, variables: { topicId: String(topicId) }, operationName: 'ugcArticleDiscussionArticle' },
      { headers: HEADERS, timeout: 15000 }
    );

    const data = response.data;
    if (data.errors) {
      return res.status(500).json({ error: 'GraphQL error', details: data.errors });
    }

    const article = (data.data && data.data.ugcArticleDiscussionArticle);
    if (!article) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const author = article.author || {};
    const topic  = article.topic  || {};
    const voteCount = (article.reactions || []).reduce(function(sum, r) {
      return sum + (r.count || 0);
    }, 0);

    const result = {
      id: topicId,
      title: article.title,
      viewCount: article.hitCount || 0,
      commentCount: topic.topLevelCommentCount || 0,
      tags: (article.tags || []).map(function(t) { return t.name; }),
      voteCount: voteCount,
      content: article.content || '',
      createdAt: article.createdAt || null,
      updatedAt: article.updatedAt || null,
      author: author.userName || 'Anonymous',
      authorAvatar: author.userAvatar || null,
      authorReputation: 0,
      url: 'https://leetcode.com/discuss/post/' + topicId + '/' + (article.slug || ''),
    };

    // Write to DB — upsert posts row first (satisfies FK), then detail
    db.stmts.upsertPost.run({
      id:                String(topicId),
      title:             result.title,
      comment_count:     result.commentCount,
      view_count:        result.viewCount,
      vote_count:        result.voteCount,
      created_at:        result.createdAt || null,
      author:            result.author,
      author_avatar:     result.authorAvatar || null,
      author_reputation: 0,
      url:               result.url,
      tags:              JSON.stringify(result.tags),
      fetched_at:        Date.now(),
    });
    db.stmts.upsertPostDetail.run({
      id:         String(topicId),
      content:    result.content,
      updated_at: result.updatedAt || null,
      fetched_at: Date.now(),
    });

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('Error fetching post detail:', err.message);
    res.status(500).json({ error: 'Failed to fetch post', message: err.message });
  }
});

// GET /api/problem/:slug
app.get('/api/problem/:slug', async (req, res) => {
  const titleSlug = req.params.slug;
  if (!titleSlug) return res.status(400).json({ error: 'Invalid problem slug' });

  const cacheKey = `problem_${titleSlug}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  // Layer 2: DB
  const dbProblem = db.stmts.getProblem.get(titleSlug);
  if (dbProblem) {
    const result = {
      id:         dbProblem.problem_id,
      title:      dbProblem.title,
      slug:       dbProblem.slug,
      difficulty: dbProblem.difficulty,
      content:    dbProblem.content || 'Content not available.',
      url:        dbProblem.url,
    };
    cache.set(cacheKey, result);
    return res.json(result);
  }

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL,
      { query: PROBLEM_QUERY, variables: { titleSlug } },
      { headers: HEADERS, timeout: 15000 }
    );

    const data = response.data;
    if (data.errors) {
      return res.status(500).json({ error: 'GraphQL error', details: data.errors });
    }

    const question = (data.data && data.data.question);
    if (!question) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const result = {
      id: question.questionFrontendId,
      title: question.title,
      slug: question.titleSlug,
      difficulty: question.difficulty,
      content: question.content || 'Content not available.',
      url: `https://leetcode.com/problems/${question.titleSlug}/`
    };

    // Write to DB
    db.stmts.upsertProblem.run({
      slug:       result.slug,
      problem_id: result.id,
      title:      result.title,
      difficulty: result.difficulty,
      content:    result.content,
      url:        result.url,
      fetched_at: Date.now(),
    });

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('Error fetching problem detail:', err.message);
    res.status(500).json({ error: 'Failed to fetch problem', message: err.message });
  }
});

// POST /api/refresh — incremental fetch (full fetch on first run, then only new posts)
app.post('/api/refresh', async (req, res) => {
  const company = req.query.company || 'google';

  // Clear node-cache for this company
  cache.keys().forEach(function(k) {
    if (k.startsWith('posts_' + company + '_')) cache.del(k);
  });

  try {
    const companyRow = db.stmts.getCompanyFetch.get(company);
    let newPosts;
    if (!companyRow) {
      // First time — full fetch; no new posts to surface in the modal
      await fetchAllPagesForCompany(company);
      newPosts = [];
    } else {
      newPosts = await fetchNewPostsForCompany(company);
    }
    res.json({ success: true, company, newPosts, newCount: newPosts.length });
  } catch (err) {
    console.error('Refresh failed:', err.message);
    res.status(500).json({ error: 'Refresh failed', message: err.message });
  }
});

// GET /api/export-posts — downloads first 30 posts as a text file (DB only, no web calls)
app.get('/api/export-posts', (req, res) => {
  const company = req.query.company || 'google';
  const year    = req.query.year    || '';
  const tag     = req.query.tag     || '';
  const limit   = db.countPostsByCompany(company, year, tag);

  const posts = db.getPostsWithContent(company, year, limit, tag);

  const filename = 'posts_' + company + (year ? '_' + year : '') + '.txt';
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');

  var lines = [];
  posts.forEach(function(post, i) {
    var date = post.createdAt ? post.createdAt.slice(0, 10) : 'unknown';
    lines.push('=== #' + (i + 1) + ': ' + post.title + ' ===');
    lines.push('Author: ' + (post.author || 'Anonymous') +
               ' | Date: ' + date +
               ' | Tags: ' + post.tags.join(', '));
    lines.push('URL: ' + (post.url || ''));
    lines.push('');
    lines.push(post.content || '[Content not yet fetched — click the post in the app to load it]');
    lines.push('');
    lines.push('='.repeat(80));
    lines.push('');
  });

  res.send(lines.join('\n'));
});

// GET /api/years — returns distinct years available in DB for a company
app.get('/api/years', (req, res) => {
  const company = req.query.company || 'google';
  const companyRow = db.stmts.getCompanyFetch.get(company);
  if (!companyRow) return res.json({ years: [] });
  const years = db.getAvailableYears(company);
  res.json({ years });
});

// POST /api/save-summary — fetch full content for given postIds and write a .txt file
app.post('/api/save-summary', async (req, res) => {
  const { company = 'google', postIds } = req.body;
  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ error: 'postIds must be a non-empty array' });
  }

  // Ensure output directory exists
  const outDir = path.resolve(SUMMARY_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  const errors = [];

  for (const topicId of postIds) {
    try {
      // Check DB first
      let dbRow = db.stmts.getPostDetail.get(String(topicId));

      if (!dbRow) {
        // Fetch from LeetCode
        const response = await axios.post(
          LEETCODE_GRAPHQL,
          { query: POST_DETAIL_QUERY, variables: { topicId: String(topicId) }, operationName: 'ugcArticleDiscussionArticle' },
          { headers: HEADERS, timeout: 15000 }
        );
        const data = response.data;
        if (data.errors || !data.data || !data.data.ugcArticleDiscussionArticle) {
          throw new Error('Post not found or GraphQL error');
        }
        const article = data.data.ugcArticleDiscussionArticle;
        const author = article.author || {};
        const topic  = article.topic  || {};
        const voteCount = (article.reactions || []).reduce((s, r) => s + (r.count || 0), 0);
        const postRow = {
          id: String(topicId),
          title: article.title,
          comment_count: topic.topLevelCommentCount || 0,
          view_count: article.hitCount || 0,
          vote_count: voteCount,
          created_at: article.createdAt || null,
          author: author.userName || 'Anonymous',
          author_avatar: author.userAvatar || null,
          author_reputation: 0,
          url: 'https://leetcode.com/discuss/post/' + topicId + '/' + (article.slug || ''),
          tags: JSON.stringify((article.tags || []).map(t => t.name)),
          fetched_at: Date.now(),
        };
        db.stmts.upsertPost.run(postRow);
        db.stmts.upsertPostDetail.run({
          id: String(topicId),
          content: article.content || '',
          updated_at: article.updatedAt || null,
          fetched_at: Date.now(),
        });
        dbRow = db.stmts.getPostDetail.get(String(topicId));
      }

      results.push({
        id:        dbRow.id,
        title:     dbRow.title,
        author:    dbRow.author,
        createdAt: dbRow.created_at,
        tags:      JSON.parse(dbRow.tags || '[]'),
        url:       dbRow.url,
        content:   dbRow.content || '',
      });
    } catch (err) {
      console.error(`[save-summary] Failed post ${topicId}:`, err.message);
      errors.push({ id: topicId, error: err.message });
      results.push({ id: String(topicId), title: '(fetch failed)', author: '', createdAt: null, tags: [], url: '', content: '' });
    }
  }

  // Format .txt
  function stripHtml(html) {
    return (html || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const datestamp = now.toISOString().slice(0, 10);
  const timePart  = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  const filename  = `${company}_${datestamp}_${timePart}.txt`;
  const filepath  = path.join(outDir, filename);

  const sep = '='.repeat(80);
  const header = [
    `LeetCode Discussion Summary — ${company} — ${now.toISOString()}`,
    `Posts: ${results.length}`,
    sep,
    '',
  ].join('\n');

  const body = results.map(function(p, i) {
    const date = p.createdAt ? p.createdAt.slice(0, 10) : 'unknown';
    return [
      `=== Post #${p.id} ===`,
      `Title:  ${p.title}`,
      `Author: ${p.author || 'Anonymous'} | Date: ${date}`,
      `Tags:   ${p.tags.join(', ') || '—'}`,
      `URL:    ${p.url || '—'}`,
      '',
      stripHtml(p.content) || '[Content unavailable]',
      '',
      sep,
      '',
    ].join('\n');
  }).join('\n');

  fs.writeFileSync(filepath, header + body, 'utf8');
  console.log(`[save-summary] Wrote ${results.length} posts to ${filepath}`);

  res.json({ success: true, filepath, postCount: results.length, errors });
});

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 LeetCode Interview Crawler`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`   API endpoints:`);
  console.log(`     GET /api/posts?company=google&page=0&orderBy=newest_to_oldest&search=`);
  console.log(`     GET /api/posts/:topicId\n`);
  console.log(`     GET /api/problem/:slug\n`);
});
