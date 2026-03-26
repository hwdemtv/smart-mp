import re

file_path = r'd:/Obsidian插件/smart-mp/src/views/previewer.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 找到要替换的部分
old_pattern = r'(\t\t)const media_id = await this\.wechatClient\.sendArticleToDraftBox\(\r?\n\t\t\tactiveDraft,\r?\n\t\t\tresult\.html\r?\n\t\t\);'

new_code = r'''\1// Enhance LaTeX formula size for WeChat only
\1let enhancedHtml = result.html;
\1// Increase inline math font size
\1enhancedHtml = enhancedHtml.replace(
\1\t/<span class="inline-math" style="([^"]*)"/g,
\1\t'<span class="inline-math" style="$1; font-size: 1.6em !important; display: inline-block !important; vertical-align: middle !important;"'
\1);
\1// Increase block math font size
\1enhancedHtml = enhancedHtml.replace(
\1\t/<section class="block-math" style="([^"]*)"/g,
\1\t'<section class="block-math" style="$1; font-size: 1.8em !important; display: block !important; margin: 1em auto !important;"'
\1);

\1const media_id = await this.wechatClient.sendArticleToDraftBox(
\1\tactiveDraft,
\1\tenhancedHtml
\1);'''

# 执行替换
new_content = re.sub(old_pattern, new_code, content)

if new_content != content:
    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)
    print("File updated successfully!")
else:
    print("Pattern not found or already updated")
