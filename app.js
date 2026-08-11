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
  var wordInput = document.getElementById('word-input')

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
  var inputSelectedForCopy = false
  var appendedInputSpan = null  // 右键时临时追加到卡片末尾的隐藏 span

  // 选中状态
  var selectedIndex = -1  // -1 表示无选中

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

        // 默认选中第一张卡片
        if (wordList.length > 0) {
          selectCard(0)
        }

        // 输入框获得焦点
        wordInput.focus()
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
    if (column === 'main' && index === selectedIndex) {
      card.classList.add('selected')
    }
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

    // 点击卡片选中
    card.addEventListener('click', function(e) {
      if (e.button === 2) return // 右键不处理
      var idx = parseInt(this.dataset.index)
      if (this.dataset.column === 'main') {
        selectCard(idx)
        wordInput.focus()
      }
    })

    return card
  }

  // ===== 选中卡片 =====
  function selectCard(index) {
    if (index < 0 || index >= wordList.length) return

    // 清除旧选中
    clearSelected()

    selectedIndex = index

    // 给卡片添加选中类
    var cards = mainContainer.querySelectorAll('.word-card')
    if (cards[index]) {
      cards[index].classList.add('selected')
    }

    // 滚动到目标位置：卡片顶部距离窗口底部 200px
    scrollToSelectedCard(index)
  }

  function clearSelected() {
    var cards = mainContainer.querySelectorAll('.word-card')
    cards.forEach(function(card) {
      card.classList.remove('selected')
    })
    selectedIndex = -1
  }

  function scrollToSelectedCard(index) {
    var cards = mainContainer.querySelectorAll('.word-card')
    if (!cards[index]) return

    var card = cards[index]
    var containerRect = mainContainer.getBoundingClientRect()
    var cardRect = card.getBoundingClientRect()

    // 卡片顶部相对于容器顶部的偏移
    var cardTopRelative = cardRect.top - containerRect.top + mainContainer.scrollTop

    // 目标位置：窗口底部往上 200px
    var targetBottom = mainContainer.clientHeight - 400
    // 卡片顶部应该对齐到的位置
    var targetScrollTop = cardTopRelative - targetBottom

    // 确保不超出边界
    targetScrollTop = Math.max(0, targetScrollTop)
    targetScrollTop = Math.min(targetScrollTop, mainContainer.scrollHeight - mainContainer.clientHeight)

    mainContainer.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })
  }

  // ===== 单词输入框事件 =====
  function setupWordInput() {
    if (!wordInput) return

    wordInput.addEventListener('keydown', function(e) {
      // 阻止空格和Enter的默认行为
      if (e.key === ' ') {
        e.preventDefault()
        checkWordInput()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        skipToNextWord()
      }
      // 方向键不在这里处理，由全局键盘事件处理
      // 但需要阻止方向键在输入框中移动光标
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        // 让全局键盘事件处理这些按键
        // 但我们需要在这里把事件传递出去
        // 实际上，全局事件监听器会捕获这些事件
      }
    })
  }

  // ===== 检查单词输入 =====
  function checkWordInput() {
    if (selectedIndex < 0 || selectedIndex >= wordList.length) {
      return
    }

    var inputValue = wordInput.value.trim()
    var currentWord = wordList[selectedIndex].word

    if (inputValue === '') {
      // 空输入不处理
      return
    }

    if (inputValue === currentWord) {
      // 输入正确：清空输入框，切换到下一个单词
      wordInput.value = ''
      wordInput.classList.remove('error')
      moveToNextWord()
    } else {
      // 输入错误：反选当前输入框内容（全选）
      wordInput.select()
      wordInput.classList.add('error')
      // 抖动动画由 CSS 处理
      // 震动后自动清除错误状态
      setTimeout(function() {
        wordInput.classList.remove('error')
      }, 400)
    }
  }

  // ===== 跳过到下一个单词（Enter键） =====
  function skipToNextWord() {
    if (selectedIndex < 0 || selectedIndex >= wordList.length) {
      return
    }
    // 清空输入框，清除错误状态，切换到下一个单词
    wordInput.value = ''
    wordInput.classList.remove('error')
    moveToNextWord()
  }

  // ===== 移动到下一个单词 =====
  function moveToNextWord() {
    if (wordList.length === 0) return

    var nextIndex = selectedIndex + 1
    if (nextIndex >= wordList.length) {
      // 尝试加载更多
      loadMore()
      // 如果加载后还不够，就停留在最后一张
      if (selectedIndex < wordList.length - 1) {
        nextIndex = selectedIndex + 1
      } else {
        // 已经是最后一张，停留在当前
        wordInput.focus()
        return
      }
    }
    selectCard(nextIndex)
    wordInput.focus()
  }

  // ===== 键盘事件 =====
  document.addEventListener('keydown', function(e) {
    var activeEl = document.activeElement

    // 判断是否在输入框中
    var isInInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')

    // 方向键处理 - 无论在不在输入框都处理
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (wordList.length === 0) return
      var nextIndex = selectedIndex + 1
      if (nextIndex >= wordList.length) {
        loadMore()
        if (selectedIndex < wordList.length - 1) {
          nextIndex = selectedIndex + 1
        } else {
          return
        }
      }
      selectCard(nextIndex)
      wordInput.focus()
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (wordList.length === 0) return
      var prevIndex = selectedIndex - 1
      if (prevIndex < 0) {
        return
      }
      selectCard(prevIndex)
      wordInput.focus()
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < wordList.length) {
        var cards = mainContainer.querySelectorAll('.word-card')
        var card = cards[selectedIndex]
        if (card) {
          swipeCardAway(selectedIndex, 1, card)
        }
      }
      wordInput.focus()
      return
    }

    // 如果在输入框中，空格和Enter已经由输入框的keydown处理了
    if (isInInput) {
      // 如果当前在输入框中，且按的是空格或Enter，已经由输入框事件处理
      if (e.key === ' ' || e.key === 'Enter') {
        return
      }
      // 其他键让输入框正常处理
      return
    }

    // 不在输入框中时的其他按键处理（如果需要）
  })

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

  // ===== 输入框：仅粘贴纯文本 + 本地缓存 =====
  var inputBox = document.getElementById('input-box')
  var INPUT_STORAGE_KEY = 'word-input-box-content'
  if (inputBox) {
    // 恢复上次内容
    try {
      var saved = localStorage.getItem(INPUT_STORAGE_KEY)
      if (saved) inputBox.textContent = saved
    } catch (err) {}

    inputBox.addEventListener('paste', function (e) {
      e.preventDefault()
      var text = (e.clipboardData || window.clipboardData).getData('text/plain')
      document.execCommand('insertText', false, text)
    })

    // 输入时自动保存（防抖）
    var saveTimer = null
    inputBox.addEventListener('input', function () {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(function () {
        try { localStorage.setItem(INPUT_STORAGE_KEY, inputBox.textContent) } catch (err) {}
      }, 300)
    })
  }

  // ===== 点击其他区域清除追加的 span 与状态 =====
  document.addEventListener('pointerdown', function (e) {
    clearAppendedSpan()
    inputSelectedForCopy = false
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

    // 水平滑动 - 只允许右滑，禁用左滑
    var deltaX = info.currentX - info.startX
    if (deltaX >= SWIPE_THRESHOLD) {
      // 只有右滑才触发
      swipeCardAway(index, 1, card)
    } else {
      resetCardPosition(index, card)
    }
  }

  // ===== 清理上次追加的隐藏 span =====
  function clearAppendedSpan() {
    if (appendedInputSpan && appendedInputSpan.parentNode) {
      appendedInputSpan.parentNode.removeChild(appendedInputSpan)
    }
    appendedInputSpan = null
  }

  // ===== 右键反选全部内容（卡片 + 输入框） =====
  function onContextMenu(e) {
    e.preventDefault()
    var card = e.currentTarget
    card.style.userSelect = 'text'
    card.style.webkitUserSelect = 'text'

    clearAppendedSpan()

    var inputBox = document.getElementById('input-box')
    var hasInput = inputBox && inputBox.textContent.trim()

    if (hasInput) {
      var span = document.createElement('span')
      span.textContent = '\n' + inputBox.textContent
      span.style.position = 'absolute'
      span.style.left = '-9999px'
      span.style.top = '0'
      span.style.width = '1px'
      span.style.height = '1px'
      span.style.overflow = 'hidden'
      span.style.opacity = '0'
      span.style.pointerEvents = 'none'
      span.setAttribute('data-role', 'appended-input')
      card.appendChild(span)
      appendedInputSpan = span
      inputSelectedForCopy = true
    } else {
      inputSelectedForCopy = false
    }

    var selection = window.getSelection()
    selection.removeAllRanges()
    var range = document.createRange()
    range.selectNodeContents(card)
    selection.addRange(range)
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
    // 只允许右滑（direction === 1），禁用左滑
    if (direction !== 1) {
      resetCardPosition(index, card)
      return
    }

    var screenWidth = window.innerWidth
    var targetX = direction * (screenWidth + 200)

    pendingRemoveIndex = index

    if (direction === 1) {
      pendingWordbookAdd = Object.assign({}, wordList[index])
      pendingWordbookAdd.meanings = wordList[index].meanings.map(function (m) {
        return Object.assign({}, m)
      })
    } else {
      pendingWordbookAdd = null
    }

    cardHeight = card.offsetHeight + CARD_GAP_PX

    card.classList.add('card-transition')
    card.style.transform = 'translateX(' + targetX + 'px)'
    card.style.zIndex = '10'

    wordList[index].offsetX = targetX
    wordList[index].zIndex = 10
    wordList[index].animClass = 'card-transition'

    // 如果滑出的是选中的卡片，清除选中状态
    if (selectedIndex === index) {
      selectedIndex = -1
    }

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

    if (pendingWordbookAdd) {
      addToWordbook(pendingWordbookAdd)
      pendingWordbookAdd = null
    }

    // 如果移除后还有卡片，选中下一张；如果没有卡片了，清除选中状态
    if (wordList.length > 0) {
      var newIndex = removedIndex
      if (newIndex >= wordList.length) {
        newIndex = wordList.length - 1
      }
      selectCard(newIndex)
    } else {
      clearSelected()
    }

    // 输入框获得焦点
    wordInput.focus()
  }

  // ===== 添加到生词本（从底部插入） =====
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

    wordbookList.push(wordCopy)

    if (wordbookEmpty) {
      wordbookEmpty.style.display = 'none'
    }

    var insertBefore = null
    var children = wordbookContainer.children
    for (var i = 0; i < children.length; i++) {
      if (children[i].classList.contains('loading-tip')) {
        insertBefore = children[i]
        break
      }
    }

    var newIndex = wordbookList.length - 1
    var cardEl = createCardElement(wordCopy, newIndex, 'wordbook')
    if (insertBefore) {
      wordbookContainer.insertBefore(cardEl, insertBefore)
    } else {
      wordbookContainer.appendChild(cardEl)
    }

    setTimeout(function () {
      cardEl.classList.remove('wordbook-enter')
      wordbookContainer.scrollTo({
        top: wordbookContainer.scrollHeight,
        behavior: 'smooth'
      });
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

  // ===== 设置输入框事件 =====
  setupWordInput()

  // ===== 启动 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()