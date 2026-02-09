$file = "d:\Obsidian插件\smart-mp\src\views\previewer.ts"
$content = Get-Content $file -Raw -Encoding UTF8

$old = @"
		const media_id = await this.wechatClient.sendArticleToDraftBox(
			activeDraft,
			result.html
		);
"@

$new = @"
		// Enhance LaTeX formula size for WeChat only
		let enhancedHtml = result.html;
		// Increase inline math font size
		enhancedHtml = enhancedHtml.replace(
			/<span class="inline-math" style="([^"]*)"/g,
			'<span class="inline-math" style="$1; font-size: 1.6em !important; display: inline-block !important; vertical-align: middle !important;"'
		);
		// Increase block math font size
		enhancedHtml = enhancedHtml.replace(
			/<section class="block-math" style="([^"]*)"/g,
			'<section class="block-math" style="$1; font-size: 1.8em !important; display: block !important; margin: 1em auto !important;"'
		);

		const media_id = await this.wechatClient.sendArticleToDraftBox(
			activeDraft,
			enhancedHtml
		);
"@

$content = $content.Replace($old, $new)
Set-Content $file -Value $content -NoNewline -Encoding UTF8
Write-Host "File updated successfully"
