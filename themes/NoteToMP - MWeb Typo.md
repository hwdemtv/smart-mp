---
theme_name: NoteToMP MWeb Typo
---

```css
/* MWeb：增大字体，便于阅读 */
.smart-mp {
  font-size: 16px;
  min-width: 200px;
  max-width: 760px;
  color: #333;
  background: #fff;
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
  text-rendering: optimizelegibility;
  /* 内外边距通常让各个浏览器样式的表现位置不同 */
  /* 重设 HTML5 标签, IE 需要在 js 中 createElement(TAG) */
  /* HTML5 媒体文件跟 img 保持一致 */
  /* 去掉各Table cell 的边距并让其边重合 */
  /* 去除默认边框 */
  /* 块/段落引用 */
  /* Firefox 以外，元素没有下划线，需添加 */
  /* 添加鼠标问号，进一步确保应用的语义是正确的（要知道，交互他们也有洁癖，如果你不去掉，那得多花点口舌） */
  /* 一致的 del 样式 */
  /* 去掉列表前的标识, li 会继承，大部分网站通常用列表来很多内容，所以应该当去 */
  /* 对齐是排版最重要的因素, 别让什么都居中 */
  /* 统一上标和下标 */
  /* 让链接在 hover 状态下显示下划线 */
  /* 默认不显示下划线，保持页面简洁 */
  /* 专名号：虽然 u 已经重回 html5 Draft，但在所有浏览器中都是可以使用的，
  * 要做到更好，向后兼容的话，添加 class="typo-u" 来显示专名号
  * 关于 <u> 标签：http://www.whatwg.org/specs/web-apps/current-work/multipage/text-level-semantics.html#the-u-element
  * 被放弃的是 4，之前一直搞错 http://www.w3.org/TR/html401/appendix/changes.html#idx-deprecated
  * 一篇关于 <u> 标签的很好文章：http://html5doctor.com/u-element/
  */
  /* 标记，类似于手写的荧光笔的作用 */
  /* 一致化 horizontal rule */
  /* 底部印刷体、版本等标记 */
  /* 可拖动文件添加拖动手势 */
  /* 强制文本换行 */
  /* 提供 serif 版本的字体设置: iOS 下中文自动 fallback 到 sans-serif */
  /* 保证块/段落之间的空白隔行 */
  /* 标题应该更贴紧内容，并与其他块区分，margin 值要相应做优化 */
  /* 在文章中，应该还原 ul 和 ol 的样式 */
  /* 同 ul/ol，在文章中应用 table 基本格式 */
  /* Responsive images */
  /* 代码片断 */
}
.smart-mp dl,
.smart-mp dt,
.smart-mp dd,
.smart-mp ul,
.smart-mp ol,
.smart-mp li,
.smart-mp h1,
.smart-mp h2,
.smart-mp h3,
.smart-mp h4,
.smart-mp h5,
.smart-mp h6,
.smart-mp pre,
.smart-mp code,
.smart-mp form,
.smart-mp fieldset,
.smart-mp legend,
.smart-mp input,
.smart-mp textarea,
.smart-mp p,
.smart-mp blockquote,
.smart-mp th,
.smart-mp td,
.smart-mp hr,
.smart-mp button,
.smart-mp article,
.smart-mp aside,
.smart-mp details,
.smart-mp figcaption,
.smart-mp figure,
.smart-mp footer,
.smart-mp header,
.smart-mp menu,
.smart-mp nav,
.smart-mp section {
  margin: 0;
  padding: 0;
}
.smart-mp article,
.smart-mp aside,
.smart-mp details,
.smart-mp figcaption,
.smart-mp figure,
.smart-mp footer,
.smart-mp header,
.smart-mp menu,
.smart-mp nav,
.smart-mp section {
  display: block;
}
.smart-mp audio,
.smart-mp canvas,
.smart-mp video {
  display: inline-block;
}
.smart-mp table {
  border-collapse: collapse;
  border-spacing: 0;
}
.smart-mp fieldset,
.smart-mp img {
  border: 0;
}
.smart-mp blockquote {
  position: relative;
  color: #999;
  font-weight: 400;
  border-left: 1px solid #1abc9c;
  padding-left: 1em;
  margin: 1em 3em 1em 2em;
}
.smart-mp acronym,
.smart-mp abbr {
  border-bottom: 1px dotted;
  font-variant: normal;
  text-decoration: none;
}
.smart-mp abbr {
  cursor: help;
}
.smart-mp del {
  text-decoration: line-through;
}
.smart-mp address,
.smart-mp caption,
.smart-mp cite,
.smart-mp code,
.smart-mp dfn,
.smart-mp em,
.smart-mp th,
.smart-mp var {
  font-style: normal;
  font-weight: 400;
}
.smart-mp ul,
.smart-mp ol {
  list-style: none;
}
.smart-mp caption,
.smart-mp th {
  text-align: left;
}
.smart-mp sub,
.smart-mp sup {
  font-size: 75%;
  line-height: 0;
  position: relative;
}
.smart-mp :root sub,
.smart-mp :root sup {
  vertical-align: baseline;
  /* for ie9 and other modern browsers */
}
.smart-mp sup {
  top: -0.5em;
}
.smart-mp sub {
  bottom: -0.25em;
}
.smart-mp a {
  color: #1abc9c;
}
.smart-mp a:hover {
  text-decoration: underline;
}
.smart-mp a {
  border-bottom: 1px solid #1abc9c;
}
.smart-mp a:hover {
  border-bottom-color: #555;
  color: #555;
  text-decoration: none;
}
.smart-mp ins,
.smart-mp a {
  text-decoration: none;
}
.smart-mp u,
.smart-mp .typo-u {
  text-decoration: underline;
}
.smart-mp mark {
  background: #fffdd1;
  border-bottom: 1px solid #ffedce;
  padding: 2px;
  /* margin: 0 5px; */
}
.smart-mp hr {
  border: none;
  border-bottom: 1px solid #cfcfcf;
  margin-bottom: 0.8em;
  height: 10px;
}
.smart-mp small,
.smart-mp .typo-small,
.smart-mp figcaption {
  font-size: 0.9em;
  color: #888;
}
.smart-mp strong,
.smart-mp b {
  font-weight: bold;
  color: #000;
}
.smart-mp [draggable] {
  cursor: move;
}
.smart-mp .clearfix {
  zoom: 1;
}
.smart-mp .textwrap,
.smart-mp .textwrap td,
.smart-mp .textwrap th {
  word-wrap: break-word;
  word-break: break-all;
}
.smart-mp .textwrap-table {
  table-layout: fixed;
}
.smart-mp .serif {
  font-family: Palatino, Optima, Georgia, serif;
}
.smart-mp p,
.smart-mp pre,
.smart-mp ul,
.smart-mp ol,
.smart-mp dl,
.smart-mp form,
.smart-mp hr,
.smart-mp table,
.smart-mp .typo-p,
.smart-mp .typo-pre,
.smart-mp .typo-ul,
.smart-mp .typo-ol,
.smart-mp .typo-dl,
.smart-mp .typo-form,
.smart-mp .typo-hr,
.smart-mp .typo-table,
.smart-mp blockquote {
  margin-bottom: 1.2em;
}
.smart-mp h1,
.smart-mp h2,
.smart-mp h3,
.smart-mp h4,
.smart-mp h5,
.smart-mp h6 {
  font-family: PingFang SC, Verdana, Helvetica Neue, Microsoft Yahei, Hiragino Sans GB, Microsoft Sans Serif, WenQuanYi Micro Hei, sans-serif;
  font-weight: lighter;
  color: #000;
  line-height: 1.35;
}
.smart-mp h1,
.smart-mp h2,
.smart-mp h3,
.smart-mp h4,
.smart-mp h5,
.smart-mp h6,
.smart-mp .typo-h1,
.smart-mp .typo-h2,
.smart-mp .typo-h3,
.smart-mp .typo-h4,
.smart-mp .typo-h5,
.smart-mp .typo-h6 {
  margin-top: 1.2em;
  margin-bottom: 0.6em;
  line-height: 1.35;
}
.smart-mp h1,
.smart-mp .typo-h1 {
  font-size: 2em;
}
.smart-mp h2,
.smart-mp .typo-h2 {
  font-size: 1.8em;
}
.smart-mp h3,
.smart-mp .typo-h3 {
  font-size: 1.6em;
}
.smart-mp h4,
.smart-mp .typo-h4 {
  font-size: 1.4em;
}
.smart-mp h5,
.smart-mp h6,
.smart-mp .typo-h5,
.smart-mp .typo-h6 {
  font-size: 1.2em;
}
.smart-mp ul,
.smart-mp .typo-ul {
  margin-left: 1.3em;
  list-style: disc;
}
.smart-mp ol,
.smart-mp .typo-ol {
  list-style: decimal;
  margin-left: 1.9em;
}
.smart-mp li ul,
.smart-mp li ol,
.smart-mp .typo-ul ul,
.smart-mp .typo-ul ol,
.smart-mp .typo-ol ul,
.smart-mp .typo-ol ol {
  margin-bottom: 0.8em;
  margin-left: 2em;
}
.smart-mp li ul,
.smart-mp .typo-ul ul,
.smart-mp .typo-ol ul {
  list-style: circle;
}
.smart-mp table th,
.smart-mp table td,
.smart-mp .typo-table th,
.smart-mp .typo-table td,
.smart-mp table caption {
  border: 1px solid #ddd;
  padding: 0.5em 1em;
  color: #666;
}
.smart-mp table th,
.smart-mp .typo-table th {
  background: #fbfbfb;
}
.smart-mp table thead th,
.smart-mp .typo-table thead th {
  background: #f1f1f1;
}
.smart-mp table caption {
  border-bottom: none;
}
.smart-mp .typo-em,
.smart-mp em,
.smart-mp legend,
.smart-mp caption {
  color: #000;
  font-weight: inherit;
}
.smart-mp img {
  max-width: 100%;
}
.smart-mp .footnotes hr {
  margin-top: 4em;
  margin-bottom: 0.5em;
}
.smart-mp pre,
.smart-mp code,
.smart-mp pre tt {
  font-family: Courier, "Courier New", monospace;
}

/* 代码块 */
.smart-mp .code-section {
  display: flex;
  border: solid 1px #ddd;
  margin: 1.5em 0;
  line-height: 26px;
  padding: 0.5em;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
}
.smart-mp .code-section pre {
  margin: 0;
  margin-block-start: 0;
  margin-block-end: 0;
  white-space: normal;
  overflow-x: auto;
  padding: 0 0 0 1em;
}
.smart-mp .code-section code {
  display: flex;
  text-wrap: nowrap;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
}
.smart-mp .code-section ul {
  margin: 0;
  padding: 0;
  margin-block-start: 0;
  margin-block-end: 0;
  width: fit-content;
  flex-shrink: 0;
  height: 100%;
  line-height: 26px;
  list-style-type: none;
}
.smart-mp .code-section ul > li {
  text-align: right;
}

/* 高亮文本样式 */
.smart-mp mark, .smart-mp .highlight {
  background-color: #ffeb3b !important;
  color: #333 !important;
  padding: 0 2px !important;
  border-radius: 3px !important;
}

/* 分隔符样式 */
.smart-mp-hr-replacement {
  margin: 30px 0 !important;
  height: 2px !important;
  background: linear-gradient(to right, transparent, #333, transparent) !important;
  font-size: 0 !important;
  border: none !important;
}
```
