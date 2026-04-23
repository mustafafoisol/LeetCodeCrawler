var axios = require('./node_modules/axios');

var query = [
  'query DiscussTopic($topicId: Int!) {',
  '  topic(id: $topicId) {',
  '    id',
  '    viewCount',
  '    topLevelCommentCount',
  '    title',
  '    tags',
  '    post {',
  '      id',
  '      voteCount',
  '      creationDate',
  '      updationDate',
  '      content',
  '      author {',
  '        username',
  '        profile {',
  '          userAvatar',
  '          reputation',
  '        }',
  '      }',
  '    }',
  '  }',
  '}'
].join('\n');

axios.post('https://leetcode.com/graphql', {
  query: query,
  variables: { topicId: 716202 }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com/discuss/interview-experience/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://leetcode.com'
  },
  timeout: 15000
}).then(function(r) {
  console.log('STATUS:', r.status);
  var body = JSON.stringify(r.data);
  console.log('RESPONSE (first 1000 chars):', body.substring(0, 1000));
}).catch(function(e) {
  console.log('ERROR:', e.message);
  if (e.response) {
    console.log('RESPONSE STATUS:', e.response.status);
    console.log('RESPONSE BODY:', JSON.stringify(e.response.data));
  }
});
