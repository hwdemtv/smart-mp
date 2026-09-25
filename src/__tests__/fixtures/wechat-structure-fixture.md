# 一级标题：结构验证基准文章

普通段落：中英文混排 SmartMP verify structure，用于验证导出管线的行高与嵌套输出稳定性。

## 二级标题：行内格式混排

这一段混合了**加粗文本**、*斜体文本*、`行内代码 inline code` 以及 [外部链接](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html)。混合内容段落是"实测行高误报"的重点回归对象，因为检测器按内联元素碎片计数行框。

中文与 English 以及数字 1234567890 和标点符号——、！？混排的长文本行，验证折行与行高稳定性。第二句继续加长文本以覆盖多行场景，确保行高计算在真实多行段落上也保持稳定可靠不出问题。

### 三级标题：列表结构

- 无序列表项一：包含**加粗**内容
- 无序列表项二：包含 `code span`
- 无序列表项三：普通文本

1. 有序列表第一项
2. 有序列表第二项
3. 有序列表第三项

## 引用块

> 引用块第一段：行高与背景验证。
>
> 引用块第二段：包含*斜体*与**加粗**混排内容，同样是行高误报的重点对象。

## 代码块

多行带语言标记的 JSON 代码块：

```json
{
  "mcpServers": {
    "blender": {
      "command": "cmd",
      "args": ["/c", "uvx", "blender-mcp"]
    }
  }
}
```

单行无语言标记的命令：

```
blender --background --python build_model.py
```

含超长 token 的代码行（验证 word-break: break-all 防溢出）：

```
curl -sSL https://registry.npmjs.org/some-very-long-package-name-with-many-dashes/-/some-very-long-package-name-with-many-dashes-0.2.16.tgz -o pkg.tgz
```

## 分隔线与收尾

---

收尾段落：全管线导出后由官方 CLI 与补充条款脚本双重校验，任何回归都应使验证命令以非零退出码失败。
