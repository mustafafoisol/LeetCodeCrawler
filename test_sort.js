const axios = require('axios');
axios.post('https://leetcode.com/graphql', {
  query: `query categoryTopicList($categories: [String!]!, $first: Int!, $orderBy: TopicSortingOption, $skip: Int, $query: String, $tags: [String!]) {
    categoryTopicList(categories: $categories, first: $first, orderBy: $orderBy, skip: $skip, query: $query, tags: $tags) {
      edges {
        node {
          id
          title
          post { creationDate }
          tags { slug }
        }
      }
    }
  }`,
  variables: {categories: ['interview-experience'], first: 5, skip: 0, orderBy: 'newest_to_oldest', tags: ['google']}
}, {
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
}).then(r => console.log(JSON.stringify(r.data, null, 2))).catch(e => console.error(e.response ? e.response.data : e.message));
