(function () {
  'use strict'

  var PAGE_SIZE = 50
  var SWIPE_THRESHOLD = 100
  var CARD_GAP_PX = 16
  var SWIPE_ANIM_MS = 360
  var FILL_UP_ANIM_MS = 320

  var mainContainer = document.getElementById('container')
  var wordbookContainer = document.getElementById('wordbook')
  var initialLoading = document.getElementById('initial-loading')
  var wordbookEmpty = document.getElementById('wordbook-empty')

  // 左列状态
  var allWords = []
  var wordList = []
  var currentIndex = PAGE_SIZE
  var uidCounter = 0
  var hasMore = true
  var total = 0

  // 右列状态（生词本）
  var wordbookList = []

  // 触摸状态
  var touchInfo = null
  var pendingRemoveIndex = -1
  var cardHeight = null
  var scrollLocked = false
  var lockedScrollTop = 0
  var pendingWordbookAdd = null

  // 音频
  var audioCtx = null

  // ===== 初始化 =====
  function init() {
    fetch('vocab-data.json')
      .then(function (res) { return res.json() })
      .then(function (vocabData) {
        allWords = vocabData.map(function (item) {
          return {
            word: item[0],
            phonetic: item[1],
            meanings: item[2].map(function (m) {
              return { pos: m[0], meaning: m[1] }
            })
          }
        })

        // Fisher-Yates 随机打乱
        for (var i = allWords.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1))
          var tmp = allWords[i]
          allWords[i] = allWords[j]
          allWords[j] = tmp
        }

        allWords.forEach(function (w, idx) {
          w.uid = idx
        })

        uidCounter = allWords.length
        total = allWords.length

        wordList = allWords.slice(0, PAGE_SIZE)
        hasMore = allWords.length > PAGE_SIZE

        renderAll()
        initialLoading.style.display = 'none'
      })
      .catch(function (err) {
        initialLoading.textContent = '数据加载失败: ' + err.message
      })
  }

  // ===== 渲染 =====
  function renderAll() {
    var scrollTop = mainContainer.scrollTop

    // 保留 loading-tip
    var tip = null
    mainContainer.innerHTML = ''
    wordList.forEach(function (item, index) {
      mainContainer.appendChild(createCardElement(item, index, 'main'))
    })

    appendMainTip()

    mainContainer.scrollTop = scrollTop
  }

  function appendMainTip() {
    var oldTip = mainContainer.querySelector('.loading-tip:not(#initial-loading)')
    if (oldTip) oldTip.remove()
    if (!hasMore) {
      var tip = document.createElement('div')
      tip.className = 'loading-tip'
      tip.textContent = '共 ' + total + ' 个单词'
      mainContainer.appendChild(tip)
    }
  }

  function createCardElement(item, index, column) {
    var card = document.createElement('div')
    card.className = 'word-card' + (item.animClass ? ' ' + item.animClass : '')
    card.dataset.index = index
    card.dataset.column = column
    card.style.transform = 'translateX(' + (item.offsetX || 0) + 'px) translateY(' + (item.offsetY || 0) + 'px)'
    if (item.zIndex) {
      card.style.zIndex = item.zIndex
    }

    var header = document.createElement('div')
    header.className = 'word-header'

    var wordText = document.createElement('span')
    wordText.className = 'word-text'
    wordText.textContent = item.word
    header.appendChild(wordText)

    var phonetic = document.createElement('div')
    phonetic.className = 'word-phonetic'
    var phoneticText = document.createElement('span')
    phoneticText.className = 'phonetic-text'
    phoneticText.textContent = '/' + item.phonetic + '/'
    phonetic.appendChild(phoneticText)
    header.appendChild(phonetic)

    card.appendChild(header)

    var meaningWrap = document.createElement('div')
    meaningWrap.className = 'word-meaning'
    item.meanings.forEach(function (meaning) {
      var mi = document.createElement('div')
      mi.className = 'meaning-item'

      var posTag = document.createElement('span')
      posTag.className = 'pos-tag'
      posTag.textContent = meaning.pos
      mi.appendChild(posTag)

      var meaningText = document.createElement('span')
      meaningText.className = 'meaning-text'
      meaningText.textContent = meaning.meaning
      mi.appendChild(meaningText)

      meaningWrap.appendChild(mi)
    })
    card.appendChild(meaningWrap)

    // 指针事件（滑动+点击）
    card.addEventListener('pointerdown', onPointerDown)
    card.addEventListener('pointermove', onPointerMove)
    card.addEventListener('pointerup', onPointerUp)
    card.addEventListener('pointercancel', onPointerUp)

    // 右键选中全部内容
    card.addEventListener('contextmenu', onContextMenu)

    return card
  }

  // ===== 分页加载 =====
  function loadMore() {
    if (!hasMore) return

    var nextIndex = currentIndex + PAGE_SIZE
    var batch = allWords.slice(currentIndex, nextIndex).map(function (item) {
      var copy = Object.assign({}, item)
      copy.meanings = item.meanings.map(function (m) { return Object.assign({}, m) })
      copy.uid = uidCounter++
      return copy
    })

    wordList = wordList.concat(batch)
    hasMore = nextIndex < allWords.length
    currentIndex = nextIndex

    batch.forEach(function (item, i) {
      var index = wordList.length - batch.length + i
      mainContainer.appendChild(createCardElement(item, index, 'main'))
    })

    appendMainTip()
  }

  // ===== 滚动检测 =====
  mainContainer.addEventListener('scroll', function () {
    if (scrollLocked) {
      mainContainer.scrollTop = lockedScrollTop
      return
    }
    if (mainContainer.scrollTop + mainContainer.clientHeight >= mainContainer.scrollHeight - 400) {
      loadMore()
    }
  })

  // ===== 输入框：仅粘贴纯文本 =====
  var inputBox = document.getElementById('input-box')
  if (inputBox) {
    inputBox.addEventListener('paste', function (e) {
      e.preventDefault()
      var text = (e.clipboardData || window.clipboardData).getData('text/plain')
      document.execCommand('insertText', false, text)
    })
  }

  // ===== 多选区复制：合并卡片与输入框文本 =====
  document.addEventListener('copy', function (e) {
    var selection = window.getSelection()
    if (selection.rangeCount < 2) return
    var combined = ''
    for (var i = 0; i < selection.rangeCount; i++) {
      var text = selection.getRangeAt(i).toString()
      if (combined && text) combined += '\n'
      combined += text
    }
    e.clipboardData.setData('text/plain', combined)
    e.preventDefault()
  })

  // ===== 指针事件 =====
  function onPointerDown(e) {
    if (pendingRemoveIndex >= 0) return
    if (e.button === 2) return // 右键不触发
    var card = e.currentTarget
    var index = parseInt(card.dataset.index)
    var column = card.dataset.column
    touchInfo = {
      index: index,
      column: column,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isHorizontal: null,
      pointerId: e.pointerId,
      cardEl: card
    }
    try { card.setPointerCapture(e.pointerId) } catch (err) {}
  }

  function onPointerMove(e) {
    if (!touchInfo || pendingRemoveIndex >= 0) return
    if (e.pointerId !== touchInfo.pointerId) return

    touchInfo.currentX = e.clientX
    touchInfo.currentY = e.clientY

    var deltaX = touchInfo.currentX - touchInfo.startX
    var deltaY = touchInfo.currentY - touchInfo.startY

    if (touchInfo.isHorizontal === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        touchInfo.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY)
        if (touchInfo.isHorizontal) {
          lockScroll()
        }
      }
    }

    if (!touchInfo.isHorizontal) return

    // 生词本列不支持滑动
    if (touchInfo.column === 'wordbook') return

    e.preventDefault()
    var card = touchInfo.cardEl
    card.style.transform = 'translateX(' + deltaX + 'px)'
    card.style.zIndex = '10'
  }

  function onPointerUp(e) {
    if (!touchInfo) return
    if (e.pointerId !== touchInfo.pointerId) return

    var info = touchInfo
    touchInfo = null
    unlockScroll()

    var card = info.cardEl
    var index = info.index

    // 点击（无明显移动）→ 播放音频
    if (info.isHorizontal === null) {
      var list = info.column === 'wordbook' ? wordbookList : wordList
      var word = list[index] && list[index].word
      if (word) playAudio(word)
      return
    }

    // 垂直滑动 → 不处理
    if (!info.isHorizontal) return

    // 生词本列不支持滑动
    if (info.column === 'wordbook') return

    // 水平滑动
    var deltaX = info.currentX - info.startX
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      swipeCardAway(index, deltaX > 0 ? 1 : -1, card)
    } else {
      resetCardPosition(index, card)
    }
  }

  // ===== 右键反选全部内容（卡片 + 输入框） =====
  function onContextMenu(e) {
    e.preventDefault()
    var card = e.currentTarget
    // 临时启用文本选择（覆盖 user-select: none）
    card.style.userSelect = 'text'
    card.style.webkitUserSelect = 'text'

    var selection = window.getSelection()
    selection.removeAllRanges()

    // 选中卡片内容
    var cardRange = document.createRange()
    cardRange.selectNodeContents(card)
    selection.addRange(cardRange)

    // 同时选中输入框内容（若非空）
    var inputBox = document.getElementById('input-box')
    if (inputBox && inputBox.textContent.trim()) {
      var inputRange = document.createRange()
      inputRange.selectNodeContents(inputBox)
      selection.addRange(inputRange)
    }
  }

  // ===== 滚动锁定 =====
  function lockScroll() {
    scrollLocked = true
    lockedScrollTop = mainContainer.scrollTop
    mainContainer.classList.add('no-scroll')
  }

  function unlockScroll() {
    scrollLocked = false
    mainContainer.classList.remove('no-scroll')
  }

  // ===== 卡片重置 =====
  function resetCardPosition(index, card) {
    card.classList.add('card-transition')
    card.style.transform = 'translateX(0px) translateY(' + (wordList[index].offsetY || 0) + 'px)'
    card.style.zIndex = ''

    wordList[index].offsetX = 0
    wordList[index].zIndex = 0
    wordList[index].animClass = 'card-transition'

    setTimeout(function () {
      card.classList.remove('card-transition')
      if (wordList[index]) wordList[index].animClass = ''
    }, 360)
  }

  // ===== 卡片滑出 =====
  function swipeCardAway(index, direction, card) {
    var screenWidth = window.innerWidth
    var targetX = direction * (screenWidth + 200)

    pendingRemoveIndex = index

    // 右滑 → 准备添加到生词本
    if (direction === 1) {
      pendingWordbookAdd = Object.assign({}, wordList[index])
      pendingWordbookAdd.meanings = wordList[index].meanings.map(function (m) {
        return Object.assign({}, m)
      })
    } else {
      pendingWordbookAdd = null
    }

    // 测量卡片高度
    cardHeight = card.offsetHeight + CARD_GAP_PX

    card.classList.add('card-transition')
    card.style.transform = 'translateX(' + targetX + 'px)'
    card.style.zIndex = '10'

    wordList[index].offsetX = targetX
    wordList[index].zIndex = 10
    wordList[index].animClass = 'card-transition'

    setTimeout(function () {
      if (pendingRemoveIndex === index) {
        animateFillUp(index)
      }
    }, SWIPE_ANIM_MS)
  }

  // ===== 底部卡片补齐 =====
  function animateFillUp(removedIndex) {
    if (!cardHeight) cardHeight = 110

    var cards = mainContainer.querySelectorAll('.word-card')
    for (var i = removedIndex + 1; i < cards.length; i++) {
      var card = cards[i]
      var item = wordList[i]
      var newY = (item.offsetY || 0) - cardHeight
      item.offsetY = newY
      item.animClass = 'card-fill-up'

      card.classList.add('card-fill-up')
      card.style.transform = 'translateX(0px) translateY(' + newY + 'px)'
    }

    setTimeout(function () {
      finalizeRemoval(removedIndex)
    }, FILL_UP_ANIM_MS)
  }

  // ===== 最终移除 =====
  function finalizeRemoval(removedIndex) {
    var cards = mainContainer.querySelectorAll('.word-card')
    if (cards[removedIndex]) {
      cards[removedIndex].remove()
    }

    wordList.splice(removedIndex, 1)

    var remainingCards = mainContainer.querySelectorAll('.word-card')
    for (var i = removedIndex; i < remainingCards.length; i++) {
      var card = remainingCards[i]
      wordList[i].offsetY = 0
      wordList[i].animClass = ''

      card.classList.remove('card-fill-up', 'card-transition')
      card.style.transform = ''
      card.style.zIndex = ''
      card.dataset.index = i
    }

    pendingRemoveIndex = -1
    total = Math.max(0, total - 1)

    appendMainTip()

    // 右滑的卡片添加到生词本
    if (pendingWordbookAdd) {
      addToWordbook(pendingWordbookAdd)
      pendingWordbookAdd = null
    }
  }

  // ===== 添加到生词本 =====
  function addToWordbook(word) {
    var wordCopy = {
      word: word.word,
      phonetic: word.phonetic,
      meanings: word.meanings,
      offsetX: 0,
      offsetY: 0,
      zIndex: 0,
      animClass: 'wordbook-enter',
      uid: uidCounter++
    }

    wordbookList.unshift(wordCopy)

    // 移除空提示
    if (wordbookEmpty) {
      wordbookEmpty.style.display = 'none'
    }

    // 创建卡片并插入到顶部
    var cardEl = createCardElement(wordCopy, 0, 'wordbook')
    wordbookContainer.insertBefore(cardEl, wordbookContainer.firstChild)

    // 更新所有卡片的 index
    var cards = wordbookContainer.querySelectorAll('.word-card')
    cards.forEach(function (c, i) {
      c.dataset.index = i
    })

    // 动画结束后移除入场类
    setTimeout(function () {
      cardEl.classList.remove('wordbook-enter')
    }, 300)
  }

  // ===== 音频播放 =====
  function playAudio(word) {
    if (!word) return
    if (!audioCtx) {
      audioCtx = new Audio()
    }
    audioCtx.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=2'
    audioCtx.play().catch(function () {})
  }

  // ===== 启动 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
