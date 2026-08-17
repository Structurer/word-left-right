(function () {
  // ===== word-review 前端：只读列表 + 删除 =====
  // 数据来源：复用项目 A 的 word-db（D1）
  // 接口：GET /api/words 分页查询 + DELETE /api/words?word=xxx 删除

  var apiBase = ''
  var listEl = document.getElementById('word-list')
  var loadingTip = document.getElementById('loading-tip')
  var totalCountEl = document.getElementById('total-count')

  // 音频播放（复用项目 A 的有道美音 API）
  var audioCtx = null

  var currentPage = 0          // 已加载到的最后一页
  var pageSize = 50
  var totalCount = 0
  var hasMore = true
  var loading = false

  function buildUrl(path) {
    return (apiBase ? apiBase.replace(/\/$/, '') : '') + path
  }

  function init() {
    fetch('config.json')
      .then(function (r) { return r.json() })
      .catch(function () { return { apiBase: '' } })
      .then(function (config) {
        apiBase = (config && config.apiBase) || ''
        loadNextPage()
      })
  }

  function loadNextPage() {
    if (loading || !hasMore) return
    loading = true
    loadingTip.style.display = 'flex'

    var nextPage = currentPage + 1
    var url = buildUrl('/api/words?page=' + nextPage + '&pageSize=' + pageSize)

    fetch(url)
      .then(function (r) { return r.json() })
      .then(function (res) {
        if (!res.success) throw new Error(res.error || '加载失败')
        totalCount = res.total
        totalCountEl.textContent = totalCount
        renderItems(res.data || [], nextPage === 1)
        hasMore = nextPage * pageSize < totalCount
        currentPage = nextPage
      })
      .catch(function (err) {
        if (currentPage === 0) {
          listEl.innerHTML = ''
          var errBox = document.createElement('div')
          errBox.className = 'empty-state'
          errBox.textContent = '加载失败：' + err.message
          listEl.appendChild(errBox)
        }
      })
      .then(function () {
        loading = false
        loadingTip.style.display = 'none'
      })
  }

  function renderItems(items, isRefresh) {
    if (isRefresh) {
      // 清空（保留 loadingTip）
      Array.prototype.forEach.call(listEl.querySelectorAll('.word-item, .empty-state'), function (n) {
        n.remove()
      })
      if (items.length === 0) {
        var empty = document.createElement('div')
        empty.className = 'empty-state'
        empty.textContent = '还没有学过的单词，去项目 A 右滑添加吧～'
        listEl.appendChild(empty)
        return
      }
    }

    items.forEach(function (item) {
      var card = createWordCard(item)
      listEl.insertBefore(card, loadingTip)
    })
  }

  function createWordCard(item) {
    var card = document.createElement('div')
    card.className = 'word-item'
    card.dataset.word = item.word

    var meanings = []
    try { meanings = JSON.parse(item.meanings || '[]') } catch (e) {}
    var meaningsHtml = meanings.map(function (m) {
      return '<span class="word-meaning-item">' +
        '<span class="word-pos">' + escapeHtml(m.pos) + '</span>' +
        escapeHtml(m.meaning) +
      '</span>'
    }).join('')

    card.innerHTML =
      '<div class="word-main">' +
        '<div>' +
          '<span class="word-title">' + escapeHtml(item.word) + '</span>' +
          (item.phonetic ? '<span class="word-phonetic">/' + escapeHtml(item.phonetic) + '/</span>' : '') +
        '</div>' +
        '<div class="word-meanings">' + meaningsHtml + '</div>' +
      '</div>' +
      '<div class="word-actions">' +
        '<button class="btn-delete" type="button">已学会</button>' +
      '</div>'

    var btn = card.querySelector('.btn-delete')
    btn.addEventListener('click', function (e) {
      e.stopPropagation()  // 阻止冒泡，避免触发卡片发音
      deleteWord(card, btn, item.word)
    })

    // 点击单词主区域（不含按钮）播放美音
    var mainEl = card.querySelector('.word-main')
    mainEl.style.cursor = 'pointer'
    mainEl.addEventListener('click', function () {
      playAudio(item.word)
    })

    return card
  }

  // ===== 音频播放：有道美音 API =====
  function playAudio(word) {
    if (!word) return
    if (!audioCtx) {
      audioCtx = new Audio()
    }
    audioCtx.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=2'
    audioCtx.play().catch(function () {})
  }

  function deleteWord(card, btn, word) {
    btn.disabled = true
    btn.textContent = '删除中...'
    fetch(buildUrl('/api/words?word=' + encodeURIComponent(word)), { method: 'DELETE' })
      .then(function (r) { return r.json() })
      .then(function (res) {
        if (!res.success) throw new Error(res.error || '删除失败')
        card.classList.add('removing')
        setTimeout(function () {
          card.remove()
          totalCount = Math.max(0, totalCount - 1)
          totalCountEl.textContent = totalCount
          // 如果列表清空了，显示空状态
          if (totalCount === 0 && !listEl.querySelector('.word-item')) {
            var empty = document.createElement('div')
            empty.className = 'empty-state'
            empty.textContent = '还没有学过的单词，去项目 A 右滑添加吧～'
            listEl.appendChild(empty)
          }
        }, 300)
      })
      .catch(function (err) {
        btn.disabled = false
        btn.textContent = '已学会'
        alert('删除失败：' + err.message)
      })
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  // 滚动到底部加载下一页
  listEl.addEventListener('scroll', function () {
    if (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 100) {
      if (hasMore && !loading) loadNextPage()
    }
  })

  init()
})()
