'use strict';
const crypto = require('crypto');
const pug = require('pug');
const Cookies = require('cookies');
const util = require('./handler-util');
const Post = require('./post');
const moment = require('moment-timezone');



const trackingIdKey = 'tracking_id';

const oneTimeTokenMap = new Map(); //キーをユーザー名、値をトークンとする連想配列

function handle(req, res) {
  const cookies = new Cookies(req,res);
  const trackingId =   addTrackingCookie(cookies,req.user);

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      Post.findAll({ order: [['id', 'DESC']] }).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\+/g, ' ');
          post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
        });
        const oneTimeToken = crypto.randomBytes(8).toString('hex');
        oneTimeTokenMap.set(req.user,oneTimeToken );
        res.end(pug.renderFile('./views/posts.pug', {
          posts: posts,
          user: req.user,
          oneTimeToken: oneTimeToken
        }));
        
        console.info(
          `閲覧されました: user: ${req.user}, ` +
          `trackingId: ${trackingId}, ` +
          `remoteAddress: ${req.connection.remoteAddress} ` +
          `user-agent: ${req.headers['user-agent']} ` +
          `削除されました: user: ${req.user}`
        )
      });
      break;
    case 'POST':
      let body = [];
      req.on('data', (chunk) => {
        body.push(chunk);
      }).on('end', () => {
        // body配列に格納されている文字列を結合する

        body = Buffer.concat(body).toString();
        // 文字列はURIエンコードされているのでデコードしてやる

        const decoded = decodeURIComponent(body);
        // decodedは'content=XXXXXX&oneTimeToken=YYYYYYYYYYYYY'

// という形式になっているのでまず'&'で分割してやる

      const dataArray = decoded.split('&');
      const content = dataArray[0] ? dataArray[0].split('content=')[1] : '';
      const requestedOneTimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
      if (oneTimeTokenMap.get(req.user) === requestedOneTimeToken) {

        console.info('投稿されました: ' + content);
        Post.create({
          content: content,
          trackingCookie: trackingId,
          postedBy: req.user
        }).then(() => {
          oneTimeTokenMap.delete(req.user);
          handleRedirectPosts(req, res);
        });
      } else {
        util.handleBadRequest(req, res);
      } 
        
      });
      break;
    default:
      break;
  }
}

function handleDelete(req, res){
  switch(req.method){
    case 'POST':
    let body = [];
    req.on('data', (chunk) => {
      body.push(chunk);
    }).on('end', () =>{
      body = Buffer.concat(body).toString();
      const decoded = decodeURIComponent(body);
      const id = decoded.split('id=')[1];
      Post.findById(id).then((post) => {
        if(req.user === post.postedBy || req.user === 'admin'){
          post.destroy();
        }
        handleRedirectPosts(req,res);
      });
    });
    break;
    default:
    util.handleBadRequest(req, res);
  }
}


/**
+ * Cookieに含まれているトラッキングIDに異常がなければその値を返し、
+ * 存在しない場合や異常なものである場合には、再度作成しCookieに付与してその値を返す
+ * @param {Cookies} cookies
+ * @param {String} userName
+ * @return {String} トラッキングID
+ */

function addTrackingCookie(cookies,userName){
  // 最初に設定されているトラッキングIDを取得する

 const requestedTrackingId = cookies.get(trackingIdKey);
 // 正常なトラッキングIDであった場合

 if(isVslidTrackingId(requestedTrackingId,userName)){
   // cookiesに設定されていたトラッキングIDをそのまま返す

  return requestedTrackingId;
 }else{
   // 未設定、もしくは異常なトラッキングIDであった場合 

// ランダムな整数値を得る

   const originalId =parseInt(crypto.randomBytes(8).toString('hex'), 16);


   const tomorrow = new Date(new Date().getTime() + (1000 * 60 * 60 * 24));
   // 新たなトラッキングIDとして"{ランダム整数値}_{ランダム整数値とユーザー名から得たハッシュ値(SHA1)}を設定する"

   const trackingId = originalId + '_' + createValidHash(originalId, userName);
   /**

 * cookie情報にCookie値と有効期限を設定する

 * 第一引数：ハッシュとして登録するCookie値のキーとして使用する文字列

 * 第二引数：Cookie値

 * 第三引数：Cookie情報のオプション

 */
   cookies.set(trackingIdKey, trackingId, {expires:tomorrow});
   // expires: 有効期限

   // 新たなトラッキングIDを返す

   return trackingId;
 }
}


/**

 * 正常なトラッキングIDを持っているかどうか判定する関数

 * @param {*} trackingId

 * @param {*} userName

 */


function isVslidTrackingId(trackingId, userName){
  // トラッキングIDを持っていない場合

  if (!trackingId) {
    // falseを返す

    return false;
  }
  // トラッキングIDを持っている場合

// {ランダム整数値}_{ランダム整数値とユーザー名から得たハッシュ値(SHA1)}という形式になっているはずなので

// '_'で分割する
  const splitted = trackingId.split('_');
  // 設定されているトラッキングIDのランダム整数値部分を取得する

  const originalId = splitted[0];
  // 設定されているトラッキングIDのハッシュ値部分を取得する

  const requestedHash = splitted[1];

  // 設定されているトラッキングIDのハッシュ値が、

// 設定されているランダム整数値と投稿ユーザー名から生成したハッシュ値と

// 一致するかどうかを判定する

  return createValidHash(originalId, userName) === requestedHash;
  // 判定結果を返す

}

const secretKey =
  '5a69bb55532235125986a0df24aca759f69bae045c7a66d6e2bc4652e3efb43da4' +
  'd1256ca5ac705b9cf0eb2c6abb4adb78cba82f20596985c5216647ec218e84905a' +
  '9f668a6d3090653b3be84d46a7a4578194764d8306541c0411cb23fbdbd611b5e0' +
  'cd8fca86980a91d68dc05a3ac5fb52f16b33a6f3260c5a5eb88ffaee07774fe2c0' +
  '825c42fbba7c909e937a9f947d90ded280bb18f5b43659d6fa0521dbc72ecc9b4b' +
  'a7d958360c810dbd94bbfcfd80d0966e90906df302a870cdbffe655145cc4155a2' +
  '0d0d019b67899a912e0892630c0386829aa2c1f1237bf4f63d73711117410c2fc5' +
  '0c1472e87ecd6844d0805cd97c0ea8bbfbda507293beebc5d9';

function createValidHash(originalId,userName){
/**

 * ランダム整数値とユーザー名からSHA1アルゴリズムを用いて生成したハッシュ値を返す関数

 * @param {*} originalId

 * @param {*} userName

 */

 // SHA1アルゴリズムを生成する

  const sha1sum = crypto.createHash('sha1');

  // SHA1アルゴリズムにハッシュ値の元となるデータを設定する

  sha1sum.update(originalId + userName + secretKey);

/* SHA1アルゴリズムを使用して、ハッシュ値を生成する

 * 第一引数：エンコーディング方式。hexは16進数値に変換しろの意味

 * 返り値：ハッシュ値の文字列

 */
  return sha1sum.digest('hex');
}


function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

module.exports = {
  handle: handle,
  handleDelete: handleDelete
};
