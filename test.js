'use strict';

const pug = require('pug');
const assert = require('assert');

const html = pug.renderFile('./views/posts.pug',{
  posts:[{
    id:1,
    content:'<script>alert(\'test\');</script>',
    postedBy : 'guest1',
    trackingCookie: '2639292283224063_ddcc625203464a9e10af58fc3eb92eed7df4b9b5',
        createdAt: new Date(),
    updatedAt: new Date()
  }],
  user: 'guest1'
});

assert(html.indexOf('&lt;script&gt;alert(\'test\');&lt;/script&gt;') > 0);
console.log('テストが正常に完了しました');