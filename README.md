# word-left-right · 单词卡片训练器

一个纯前端的英语单词训练工具，左右两列布局：左列输入拼写 + 卡片滑动，右列生词本 + 可持久化笔记输入框，支持与豆包等浏览器插件联动查询。

---

## 功能总览

### 左列 — 训练区

| 功能 | 交互 |
| --- | --- |
| 选中当前卡片 | 鼠标点击卡片 / ↑↓ 方向键切换 |
| 拼写校验 | 在输入框输入单词，按 **空格** 判断 |
| 跳过当前词 | 按 **Enter** |
| 添加到生词本 | **右滑卡片**（触摸/鼠标拖动超过 100px 触发）/ **→** 方向键 |
| 播放发音 | 点击（无拖动的按下 & 抬起）调用有道语音接口朗读 |
| 滚动条 | 使用 `direction: rtl` 把竖向滚动条放到**左侧**，且始终显示不隐藏 |
| 分页加载 | 首屏加载 50 张，滚动到距底部 400px 时自动追加下一批 |

### 右列 — 生词本 + 笔记

| 区域 | 说明 |
| --- | --- |
| 上部：生词本列表 | 右滑后的卡片追加到**底部**（保留顶部占位提示），入场后自动滚动到底部 |
| 下部：笔记输入框 | `contenteditable`，固定 384px 高，**回车换行**通过 `white-space: pre-wrap` + `innerText` 正确保留 |

> 生词本**顶部占位卡片**：始终存在的 `wordbook-empty-card`，空状态显示「右滑卡片添加到生词本」。

---

## 豆包 / AI 插件联动（核心特性）

右键左列任意单词卡片，会触发「卡片内容 + 笔记内容」的**合并选区**：

1. 输入框有文本时，把 `\n + 输入框内容` 追加到卡片末尾的一个**隐藏 `<span>`** 中（`position: absolute; left: -9999px; opacity: 0`）
2. 对整个卡片执行 `Range.selectNodeContents()` + `Selection.addRange()`，形成**单个原生选区**
3. `window.getSelection().toString()` 会返回「卡片单词 + 音标 + 释义 + 换行 + 输入框笔记」的完整文本
4. 豆包等浏览器插件通过检测 `selectionchange` + 读取选中文本即可识别内容，弹出悬浮的「搜索 / 解释」等按钮

> 为什么用单选区而不是多 range：Chrome 的 Selection API 对跨普通 div 与 contenteditable 的 multi-range 读取不稳定，`toString()` 往往只返回第一个 range。单选区方案最兼容。

---

## 本地持久化

| Key | 内容 | 写入时机 |
| --- | --- | --- |
| `word-input-box-content` | 笔记输入框的 `innerText`（保留换行符） | 输入时防抖 300ms 自动保存 |

页面打开时自动从 `localStorage` 恢复内容，输入框不会因为刷新丢失笔记。

> 生词本列表**当前仅保存在内存中**，刷新会清空，可在后续版本扩展 `wordbookList` 的持久化。

---

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `↑` / `↓` | 上一张 / 下一张卡片（自动聚焦输入框） |
| `→` | 把当前卡片右滑加入生词本 |
| `空格` | 校验输入框中的拼写（正确 → 下一张；错误 → 抖动红框并全选） |
| `Enter` | 跳过当前词，切到下一张 |
| 鼠标**右键**卡片 | 卡片内容 + 笔记内容合并为一个选区，供浏览器插件读取 |

---

## 架构与文件

```
word-left-right/
├── index.html          两列布局骨架：左 input-area + container / 右 wordbook-wrap + input-box
├── style.css           样式：滚动条左侧化、隐藏原生滚动条、卡片/输入框、shake 动画
├── app.js              业务逻辑（单 IIFE）
└── vocab-data.json     词表数据：[[word, phonetic, [[pos, meaning], ...]], ...]
```

### 核心常量（`app.js` 顶部）

```
PAGE_SIZE       = 50     首屏 & 每批加载量
SWIPE_THRESHOLD = 100    右滑触发阈值 (px)
SWIPE_ANIM_MS   = 360    卡片滑出动画时长
FILL_UP_ANIM_MS = 320    下方卡片上移补位动画时长
```

### 数据结构

```js
// 单词条目
{
  word:     String,     // 拼写
  phonetic: String,     // IPA，不含 /.../
  meanings: [{ pos, meaning }],
  offsetX:  Number,     // 卡片水平位移（右滑动画）
  offsetY:  Number,     // 卡片垂直位移（补位动画）
  zIndex:   Number,
  animClass:String,     // 'card-transition' | 'card-fill-up' | 'wordbook-enter'
  uid:      Number      // 全局唯一 id
}
```

### 右滑 → 生词本状态机

1. **`onPointerMove`**：水平位移超过 8px 判定为横向，调用 `lockScroll()` 锁定容器滚动
2. **`onPointerUp`**：横向 + 超过 `SWIPE_THRESHOLD` → `swipeCardAway(index, 1, card)`
3. **`swipeCardAway`**：`translateX(屏幕宽+200)` 滑出，`pendingWordbookAdd` 暂存待生词本添加的卡片，`pendingRemoveIndex` 标记当前移除槽位
4. **`animateFillUp`**（360ms 后）：后续所有卡片 `offsetY - cardHeight` 整体上移
5. **`finalizeRemoval`**（再 320ms 后）：从 DOM 与 `wordList` 删除该卡片，重排 `dataset.index`，调用 `addToWordbook(pendingWordbookAdd)`，选中下一张

### 滚动锁定

由于滚动条现在始终显示，互动期间不再用 `overflow: hidden` 隐藏，而是：
- `lockScroll()` 保存 `lockedScrollTop`
- `mainContainer` 的 `scroll` 监听里若 `scrollLocked` 则立即 `scrollTop = lockedScrollTop`

---

## 运行方式

项目是纯静态文件，**必须通过 HTTP(S) 打开**（因为用 `fetch('vocab-data.json')` 加载词表，`file://` 协议下会因 CORS 失败）。

```bash
# 方法一：Python 内置服务器
cd word-left-right
python -m http.server 8080
# 然后访问 http://localhost:8080

# 方法二：VSCode Live Server 插件
# 右键 index.html → Open with Live Server
```

---

## 词表格式（vocab-data.json）

```json
[
  ["resurgent", "rɪˈsɜːrdʒənt", [["adj.", "复活的；复苏的"], ["n.", "复活者"]]],
  ["chronology", "krəˈnɑːlədʒi", [["n.", "年表；年代学"]]]
]
```

外层数组：全部单词。  
每项：`[拼写, 音标字符串, 释义数组]`。  
释义数组每项：`[词性标签, 中文释义]`。

---

## 关键实现细节备忘

| 问题 | 解决方案 |
| --- | --- |
| 滚动条想放左侧 | CSS `direction: rtl` 挂到容器，直接子元素再恢复 `direction: ltr` |
| contenteditable 换行不保存 | 读写用 `innerText`（把 `<br>` / `<div>` 换行转成 `\n`）+ CSS `white-space: pre-wrap`（让 `\n` 视觉上换行）|
| 让豆包插件读到卡片 + 笔记合并内容 | 单选区 + 隐藏 span 追加法（见「豆包联动」节），**不要用 `Selection.addRange()` 多选区** |
| 卡片右滑时防止上下滚动 | `lockScroll()` + `scroll` 事件强行复位 `scrollTop` |
| 分页卡片 dataset.index 不一致 | 移除/新增时遍历重写 `dataset.index`；新增时直接取 `wordList.length - 1` |

---

## 已知限制

- 生词本仅保存在内存中（刷新清空）
- 发音依赖有道接口 `dict.youdao.com/dictvoice`，需要可外网访问
- 左列仅支持**右滑加入生词本**，左滑被禁用（会弹回原位）
