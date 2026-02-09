---
theme_name: NoteToMP Maple
---

```css
/* =========================================================== */
/* 笔记样式 https://github.com/xbmlz/hexo-theme-maple            */
/* =========================================================== */
.smart-mp {
    user-select: text;
    -webkit-user-select: text;
    color: #555;
    font-family: "Inter", Inter var, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
}

.smart-mp:last-child {
    margin-bottom: 0;
}

.smart-mp .fancybox-img {
    border: none;
}

.smart-mp .fancybox-img:hover {
    opacity: none;
    border: none;
}

/*
  =================================
   Heading 
  ==================================
  */
.smart-mp h1 {
    color: #222;
    font-weight: 800;
    font-size: 2.25em;
    margin-top: 0;
    margin-bottom: 0.8888889em;
    line-height: 1.1111111;
}

.smart-mp h2 {
    color: inherit;
    font-weight: 700;
    font-size: 1.5em;
    margin-top: 2em;
    margin-bottom: 1em;
    line-height: 1.3333333;
}

.smart-mp h3 {
    color: inherit;
    font-weight: 600;
    font-size: 1.25em;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
    line-height: 1.6;
}

.smart-mp h4 {
    color: inherit;
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.5;
}

/*
  =================================
  Horizontal Rules
  ==================================
  */
.smart-mp hr {
    border-color: rgba(125, 125, 125, 0.3);
    margin-top: 3em;
    margin-bottom: 3em;
}

/*
  =================================
  Paragraphs
  ==================================
  */
.smart-mp p {
    margin: 1em 0;
}

/*
  =================================
  Emphasis
  ==================================
  */
.smart-mp strong {
    color: #222;
    font-weight: 600;
}

.smart-mp em {
    color: inherit;
}

.smart-mp s {
    color: inherit;
}

/*
  =================================
  Blockquotes
  ==================================
  */
.smart-mp blockquote {
    font-size: 1rem;
    display: block;
    margin: 1em 0;
    padding: 1em 1.2em 1em 1.2em;
    position: relative;
    color: inherit;
    border-left: 0.25rem solid rgba(125, 125, 125, 0.302);
}

.smart-mp blockquote p {
    margin: 0;
}

.smart-mp blockquote footer strong {
    margin-right: 0.5em;
}

/*
  =================================
  List
  ==================================
  */
.smart-mp ul {
    margin: 0;
    /* padding: 0; */
    margin-top: 1.25em;
    margin-bottom: 1.25em;
}

.smart-mp ul>li {
    position: relative;
    /* padding-left: 1.75rem; */
    line-height: 1.8em;
}


.smart-mp ul>li::marker {
    color: #555;
    /* font-size: 1.5em; */
}

.smart-mp ol {
    margin: 0;
    padding: 0;
    margin-top: 1.25em;
    margin-bottom: 0em;
    list-style-type: decimal;
}

.smart-mp ol>li {
    position: relative;
    padding-left: 0.8em;
    margin-left: 2em;
    line-height: 1.8em;
}

/*
  =================================
  Link
  ==================================
  */
.smart-mp a {
    color: #000;
    text-decoration: none;
    font-weight: 500;
    text-decoration: none;
    border-bottom: 1px solid rgba(125, 125, 125, 0.3);
    transition: border 0.3s ease-in-out;
}

.smart-mp a:hover {
    border-bottom: 1px solid #555;
}

/*
  =================================
  Table
  ==================================
  */
.smart-mp table {
    width: 100%;
    table-layout: auto;
    text-align: left;
    margin-top: 2em;
    margin-bottom: 2em;
    font-size: 0.875em;
    line-height: 1.7142857;
    border-collapse: collapse;
    border-color: inherit;
    text-indent: 0;
}

.smart-mp table thead {
    color: #000;
    font-weight: 600;
    border-bottom-width: 1px;
    border-bottom-color: #d1d5db;
}

.smart-mp table thead th {
    vertical-align: bottom;
    padding-right: 0.5714286em;
    padding-bottom: 0.5714286em;
    padding-left: 0.5714286em;
}

.smart-mp table thead th:first-child {
    padding-left: 0;
}

.smart-mp table thead th:last-child {
    padding-right: 0;
}

.smart-mp table tbody tr {
    border-bottom-width: 1px;
    border-bottom-color: #e5e7eb;
}

.smart-mp table tbody tr:last-child {
    border-bottom-width: 0;
}

.smart-mp table tbody td {
    vertical-align: top;
    padding-top: 0.5714286em;
    padding-right: 0.5714286em;
    padding-bottom: 0.5714286em;
    padding-left: 0.5714286em;
}

.smart-mp table tbody td:first-child {
    padding-left: 0;
}

.smart-mp table tbody td:last-child {
    padding-right: 0;
}

/*
  =================================
  Images
  ==================================
  */
.smart-mp img {
    margin: 2em auto;
}

.smart-mp .footnotes hr {
    margin-top: 4em;
    margin-bottom: 0.5em;
}

/*
  =================================
  Code
  ==================================
  */
.smart-mp .code-section {
    display: flex;
    border: solid 1px rgb(240, 240, 240);
    margin: 1.5em 0;
    line-height: 26px;
    padding: 0.5em;
    font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
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

.smart-mp .code-section ul>li {
    line-height: 26px;
    text-align: right;
}

.smart-mp .code-section pre {
    margin: 0;
    margin-block-start: 0;
    margin-block-end: 0;
    white-space: normal;
    overflow-x: auto;
    padding: 0 0 0 1em;
    background: transparent !important;
}

.smart-mp code {
    font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
    color: #333;
    background: rgb(250, 250, 250);
    font-size: 0.875em;
    padding: 1em;
    text-wrap: nowrap;
}

.smart-mp .code-section pre code {
    color: inherit;
    display: flex;
    text-wrap: nowrap;
    font-size: inherit;
    padding: 0;
    background: transparent;
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
  background: linear-gradient(to right, transparent, #555, transparent) !important;
  font-size: 0 !important;
  border: none !important;
}
```
