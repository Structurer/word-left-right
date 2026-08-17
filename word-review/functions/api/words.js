// Cloudflare Pages Function — word-review（项目 B）
//
// 路由：
//   GET    /api/words              — 分页列表查询（?page=1&pageSize=50）
//   GET    /api/words?word=xxx     — 单条精确查询
//   DELETE /api/words?word=xxx     — 按单词删除
//
// ❌ 完全没有 onRequestPost / PUT / PATCH，从代码层杜绝新增和更新写入。
//    D1 本身没有只读权限；安全依靠"不存在写入接口"保证，不是依靠前端隐藏按钮。

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

// GET /api/words
// - ?word=xxx        单条查询，返回 { success, data: row | null }
// - 无 word 参数     分页列表，返回 { success, data: [...], total, page, pageSize }
export async function onRequestGet(context) {
  var request = context.request
  var env = context.env
  var url = new URL(request.url)
  var word = url.searchParams.get('word')

  try {
    // 单条查询
    if (word) {
      var row = await env.DB.prepare(
        'SELECT word, phonetic, meanings, created_at FROM words WHERE word = ?'
      ).bind(word).first()
      return jsonResponse({ success: true, data: row || null })
    }

    // 分页列表
    var page = parseInt(url.searchParams.get('page') || '1', 10)
    var pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)
    if (!page || page < 1) page = 1
    if (!pageSize || pageSize < 1 || pageSize > 200) pageSize = 50
    var offset = (page - 1) * pageSize

    var items = await env.DB.prepare(
      'SELECT word, phonetic, meanings, created_at FROM words ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(pageSize, offset).all()

    var countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM words').first()
    var total = countRow ? countRow.total : 0

    return jsonResponse({
      success: true,
      data: items.results || [],
      total: total,
      page: page,
      pageSize: pageSize
    })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500)
  }
}

// DELETE /api/words?word=xxx — 按单词删除
export async function onRequestDelete(context) {
  var request = context.request
  var env = context.env
  var url = new URL(request.url)
  var word = url.searchParams.get('word')

  if (!word) {
    return jsonResponse({ success: false, error: 'word is required' }, 400)
  }

  try {
    await env.DB.prepare('DELETE FROM words WHERE word = ?').bind(word).run()
    return jsonResponse({ success: true, word: word })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500)
  }
}
