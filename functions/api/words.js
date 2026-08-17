

// Cloudflare Pages Function：单词上传 API
// 路由：POST /api/words
// 部署：wrangler pages deploy . --project-name=word-left-right
// D1 绑定名：DB（见根目录 wrangler.toml）

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS)
  })
}

// OPTIONS 预检
export function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS })
}

// POST /api/words — 上传单词（重复时覆盖更新 phonetic/meanings）
export async function onRequestPost(context) {
  var request = context.request
  var env = context.env

  try {
    var body = await request.json()
    var word = body.word
    var phonetic = body.phonetic
    var meanings = body.meanings

    if (!word || typeof word !== 'string') {
      return jsonResponse({ success: false, error: 'word is required' }, 400)
    }

    var meaningsJson = JSON.stringify(meanings || [])
    await env.DB.prepare(
      'INSERT INTO words (word, phonetic, meanings) VALUES (?, ?, ?)' +
      ' ON CONFLICT(word) DO UPDATE SET phonetic = excluded.phonetic, meanings = excluded.meanings'
    ).bind(word, phonetic || '', meaningsJson).run()

    return jsonResponse({ success: true, word: word })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500)
  }
}
