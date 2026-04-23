require('dotenv').config();
var axios = require('./node_modules/axios');

var LEETCODE_SESSION = process.env.LEETCODE_SESSION;
var CSRF_TOKEN       = process.env.CSRF_TOKEN;

var query = `
query discussPostItems($orderBy: ArticleOrderByEnum, $keywords: [String]!, $tagSlugs: [String!], $skip: Int, $first: Int) {
  ugcArticleDiscussionArticles(
    orderBy: $orderBy
    keywords: $keywords
    tagSlugs: $tagSlugs
    skip: $skip
    first: $first
  ) {
    totalNum
    pageInfo { hasNextPage }
    edges {
      node {
        topicId
        title
        summary
        createdAt
        tags { name slug }
        author { userName }
        topic { topLevelCommentCount }
        reactions { count reactionType }
      }
    }
  }
}
`;

axios.post('https://leetcode.com/graphql', {
  query: query,
  variables: { orderBy: 'HOT', keywords: [''], tagSlugs: ['google'], skip: 0, first: 5 },
  operationName: 'discussPostItems'
}, {
  headers: {
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com/discuss/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'https://leetcode.com',
    'Cookie': `LEETCODE_SESSION=${LEETCODE_SESSION}; csrftoken=${CSRF_TOKEN}`,
    'x-csrftoken': CSRF_TOKEN
  },
  timeout: 15000
}).then(function(r) {
  var d = r.data;
  if (d.errors) {
    console.error('GraphQL errors:', JSON.stringify(d.errors, null, 2));
    return;
  }
  var list = d.data && d.data.ugcArticleDiscussionArticles;
  if (!list) { console.error('No data returned'); return; }

  console.log('totalNum:', list.totalNum);
  console.log('hasNextPage:', list.pageInfo.hasNextPage);
  console.log('\nFirst 5 posts:');
  list.edges.forEach(function(e, i) {
    var n = e.node;
    console.log((i+1) + '. [' + n.topicId + '] ' + n.title);
    console.log('   author:', n.author && n.author.userName);
    console.log('   tags:', n.tags.map(function(t){ return t.slug; }).join(', '));
    console.log('   created:', n.createdAt);
  });
}).catch(function(e) {
  console.error('Request error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Body:', JSON.stringify(e.response.data));
  }
});
