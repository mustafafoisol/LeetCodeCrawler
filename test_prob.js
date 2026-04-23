const axios = require('axios');
axios.post('https://leetcode.com/graphql', {
  query: `query { question(titleSlug: "two-sum") { title content difficulty } }`
}, {
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
}).then(r => console.log(r.data.data)).catch(console.error);
