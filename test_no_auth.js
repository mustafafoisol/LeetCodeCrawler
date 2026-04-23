const axios = require('axios');

const GRAPHQL_URL = 'https://leetcode.com/graphql';

// No Cookie or x-csrftoken — testing anonymous access
const HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://leetcode.com/discuss/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': 'https://leetcode.com',
};

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

async function testQuery(name, query, variables) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Variables: ${JSON.stringify(variables)}`);
  console.log('='.repeat(60));
  try {
    const res = await axios.post(GRAPHQL_URL, { query, variables }, { headers: HEADERS });
    const data = res.data;
    if (data.errors) {
      console.log(`RESULT: GraphQL errors (HTTP ${res.status})`);
      console.log(JSON.stringify(data.errors, null, 2));
    } else {
      console.log(`RESULT: SUCCESS (HTTP ${res.status})`);
      const preview = JSON.stringify(data.data, null, 2).slice(0, 800);
      console.log(preview);
      if (JSON.stringify(data.data).length > 800) console.log('... (truncated)');
    }
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.log(`RESULT: HTTP ERROR ${status}`);
    if (body) console.log(JSON.stringify(body, null, 2));
    else console.log(err.message);
  }
}

(async () => {
  await testQuery('PROBLEM_QUERY (two-sum)', PROBLEM_QUERY, { titleSlug: 'two-sum' });
  await testQuery('POSTS_LIST_QUERY (google, first 3)', POSTS_LIST_QUERY, {
    orderBy: 'HOT',
    keywords: [''],
    tagSlugs: ['google'],
    skip: 0,
    first: 3,
  });
  await testQuery('POST_DETAIL_QUERY (topicId 716202)', POST_DETAIL_QUERY, { topicId: 716202 });
  console.log('\nDone.');
})();
