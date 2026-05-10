/**
 * Procesing the image data for a valid WeChat MP article for upload.
 *
 */
import { $t } from 'src/lang/i18n';
import { fetchImageBlob, serializeElement } from 'src/utils/utils';
import { WechatClient } from './../wechat-api/wechat-client';
import SmartMPPlugin from 'src/main';
import { Logger } from 'src/utils/logger';
import SparkMD5 from 'spark-md5';
function imageFileName(mime: string) {
    const type = mime.split('/')[1]
    return `image-${new Date().getTime()}.${type}`
}
export function svgToPng(svgData: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        let objectUrl = '';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = img.width * dpr;
            canvas.height = img.height * dpr;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(objectUrl);
                reject(new Error($t('render.faild-canvas-context')));
                return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(objectUrl);
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error($t('render.failed-to-convert-canvas-to-blob')));
                }
            }, 'image/png');
        };

        img.onerror = (e) => {
            Logger.warn('PostRender', '[svgToPng] Image load error:', e);
            URL.revokeObjectURL(objectUrl);
            reject(new Error($t('render.failed-to-load-image')));
        };

        // Use Blob for safety with Unicode/Content
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
    });
}
// Helper to clean up dataUrl for WeChat compatibility (if needed) or debug
function cleanDataURL(dataUrl: string): string {
    return dataUrl;
}

function dataURLtoBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;

    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
}
export function getCanvasBlob(canvas: HTMLCanvasElement) {
    const pngDataUrl = canvas.toDataURL('image/png');
    const pngBlob = dataURLtoBlob(pngDataUrl);
    return pngBlob;
}

const imageCache = new Map<string, string>();
const SVG_CACHE_KEY = 'smart-mp-svg-upload-cache';
const SVG_CACHE_MAX = 200;

// Load persistent cache from localStorage
function loadImageCache(): void {
    try {
        const raw = localStorage.getItem(SVG_CACHE_KEY);
        if (raw) {
            const entries = JSON.parse(raw) as [string, string][];
            for (const [k, v] of entries) {
                imageCache.set(k, v);
            }
        }
    } catch { /* ignore corrupted cache */ }
}

// Save cache to localStorage (LRU eviction: keep newest entries)
function saveImageCache(): void {
    try {
        if (imageCache.size > SVG_CACHE_MAX) {
            const entries = Array.from(imageCache.entries());
            const keep = entries.slice(-SVG_CACHE_MAX);
            imageCache.clear();
            for (const [k, v] of keep) {
                imageCache.set(k, v);
            }
        }
        localStorage.setItem(SVG_CACHE_KEY, JSON.stringify(Array.from(imageCache.entries())));
    } catch { /* localStorage full or unavailable */ }
}

// Initialize cache on load
loadImageCache();

function md5Hash(str: string): string {
    return SparkMD5.hash(str);
}

export async function uploadSVGs(root: HTMLElement, wechatClient: WechatClient) {
    const svgs: SVGSVGElement[] = []
    root.querySelectorAll('svg').forEach(svg => {
        svgs.push(svg)
    })

    const MAX_CONCURRENT = 3;

    // Process SVGs in batches to prevent memory issues
    for (let i = 0; i < svgs.length; i += MAX_CONCURRENT) {
        const batch = svgs.slice(i, i + MAX_CONCURRENT);
        const batchPromises = batch.map(async (svg) => {
            // [Fix] 辅助函数：解析 CSS 长度值 (支持 px, ex, em)
            const parseLength = (val: string | null): number => {
                if (!val) return 0;
                const num = parseFloat(val);
                if (isNaN(num)) return 0;
                if (val.includes('ex')) return num * 8; // 1ex ≈ 8px
                if (val.includes('em')) return num * 16; // 1em ≈ 16px
                return num; // 默认为 px
            };

            // [Fix] 辅助函数：修复/补全 SVG viewBox (防止 MathJax 生成不规范的 SVG)
            const checkViewBox = (svgEl: SVGSVGElement) => {
                if (!svgEl.hasAttribute('viewBox')) {
                    const w = parseLength(svgEl.getAttribute('width'));
                    const h = parseLength(svgEl.getAttribute('height'));
                    if (w > 0 && h > 0) {
                        // 将 em/ex 转换为像素近似值用于 viewBox (仅作比例参考)
                        // 注意：这里的 w/h 是像素值（parseLength 已转换）
                        svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
                    } else {
                        // 实在没有，给个默认值防止报错，后续逻辑会兜底
                        svgEl.setAttribute('viewBox', '0 0 100 100');
                    }
                }
            };

            // 立即修复 viewBox
            checkViewBox(svg);

            // [Fix] Capture actual rendered dimensions before conversion
            // 优先使用 SVG 属性 (MathJax 提供的固有尺寸)，避免受 CSS (如 width: 100%) 影响导致行内公式被拉伸
            const rect = svg.getBoundingClientRect();

            const attrWidth = parseLength(svg.getAttribute('width'));
            const attrHeight = parseLength(svg.getAttribute('height'));

            // [Fix] 获取 viewBox 以便计算宽高比
            let viewBoxAR = 0;
            const viewBox = svg.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/\s+|,/).map(parseFloat).filter(n => !isNaN(n));
                if (parts.length === 4 && parts[3] > 0) {
                    viewBoxAR = parts[2] / parts[3];
                }
            }

            // [Fix] 增强判断公式类型 (V5.4 上下文查找版)
            let isInlineMath = true;

            // 使用 closest 查找最近的父级容器，比 parentElement 更稳健
            const blockParent = svg.closest('.block-math') || svg.closest('mjx-container[display="true"]');
            const inlineParent = svg.closest('.inline-math') || svg.closest('mjx-container[display="false"]');

            if (blockParent) {
                isInlineMath = false;
            } else if (inlineParent) {
                isInlineMath = true;
            } else {
                // 如果都有没找到，尝试检查直接父级的 display 属性 (MathJax 默认行为)
                const parent = svg.parentElement;
                if (parent) {
                    const displayAttr = parent.getAttribute('display');
                    if (displayAttr === 'true') {
                        isInlineMath = false;
                    }
                }
            }

            // [Fix] 尺寸计算策略 (V5.1 精调版)
            let width = 0;
            let height = 0;

            if (isInlineMath) {
                // 行内公式：绝对不信任 getBoundingClientRect
                // 设定基准高度：13px (约 0.8em，配合 scale=0.8 的视觉调整)
                const baseHeight = 13;

                height = baseHeight;
                if (viewBoxAR > 0) {
                    width = height * viewBoxAR;
                } else {
                    // 回退策略：仅信任属性或默认估算
                    // 绝对不要使用 rect.width，因为那就是导致"巨大化"的元凶(屏幕渲染尺寸)
                    width = attrWidth || (height * 1.5); // 默认 1.5倍宽

                    // 再次兜底
                    if (width > 200) width = 50;
                }
            } else {
                // 块级公式：可以用 rect 兜底，但优先属性
                width = attrWidth || rect.width || 300;
                height = attrHeight || rect.height || 150;

                // 如果用 rect，依然进行最后的块级确认
                if (width > 200) isInlineMath = false;
            }

            // [Fix] 保存原始显示尺寸 (1x)，用于设置 img 属性 (HiDPI 适配)
            // 必须取整，避免小数导致渲染问题
            const displayWidth = Math.round(width);
            const displayHeight = Math.round(height);

            // 行内公式：较小的放大比例，避免比文字大太多
            // 块内公式：更大的放大比例，确保清晰可见
            // [Fix V5.3] 降低放大倍数，防止物理尺寸过大 (原: 4/12 -> 现: 2/3)
            const scale = isInlineMath ? 2 : 3;

            // [Fix V5.3] 降低最小尺寸限制，防止小公式被强行撑大
            const minWidth = isInlineMath ? 20 : 100;
            const minHeight = isInlineMath ? 10 : 50;

            width = Math.max(width * scale, minWidth);
            height = Math.max(height * scale, minHeight);

            let svgString = serializeElement(svg);

            // [Fix] Robust SVG Sanitization for MathJax & Excalidraw
            // 1. Ensure xmlns exists
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            // 2. Force pixel dimensions on the SVG string for correct Canvas scaling
            // Regex to replace existing width/height or add them
            if (svgString.match(/ width="[^"]*"/)) {
                svgString = svgString.replace(/ width="[^"]*"/, ` width="${width}"`);
            } else {
                svgString = svgString.replace('<svg', `<svg width="${width}"`);
            }
            if (svgString.match(/ height="[^"]*"/)) {
                svgString = svgString.replace(/ height="[^"]*"/, ` height="${height}"`);
            } else {
                svgString = svgString.replace('<svg', `<svg height="${height}"`);
            }

            // 3. Replace dynamic CSS variables (var(--...)) with static color because they fail in Blob context
            svgString = svgString.replace(/var\(--[^)]+\)/g, '#333');
            // 4. Replace currentColor
            svgString = svgString.replace(/currentColor/g, '#333');

            const hash = md5Hash(svgString);

            // [Cache Check]: logic to prevent re-uploading same math formula
            if (imageCache.has(hash)) {
                const url = imageCache.get(hash);
                const img = document.createElement('img');
                img.src = url!;
                img.setAttribute('data-upload-processed', 'true');

                const verticalAlign = svg.style.verticalAlign || '-0.25em';

                if (isInlineMath) {
                    // 行内公式：限制高度，保持与文本和谐
                    img.setAttribute('class', 'inline-math');
                    // [Fix V5.5] 微调高度：1.25em -> 1.0em (响应用户"小一点"的需求)
                    img.setAttribute('style', `height: 1.0em; vertical-align: ${verticalAlign}; width: auto;`);
                    // [Fix] 显式设置显示尺寸 (HiDPI 适配)
                    img.setAttribute('width', displayWidth.toString());
                    img.setAttribute('height', displayHeight.toString());
                } else {
                    // 块内公式：限制最大宽度，居中
                    img.setAttribute('class', 'block-math');
                    img.setAttribute('style', `max-width: 90%; height: auto; display: block; margin: 1em auto;`);
                }

                if (parent && parent instanceof Element && parent.tagName.toLowerCase() === 'mjx-container') {
                    parent.replaceWith(img);
                } else {
                    svg.replaceWith(img);
                }
                return;
            }

            // Lower threshold to 50 to allow very simple math symbols
            if (svgString.length < 50) {
                Logger.warn('PostRender', '[uploadSVGs] SVG too small, likely empty or artifact:', svgString.length);
                return;
            }

            try {
                const blob = await svgToPng(svgString);
                const res = await wechatClient.uploadMaterial(blob, imageFileName(blob.type));
                if (res && res.url) {
                    // Update Cache
                    imageCache.set(hash, res.url);
                    saveImageCache();

                    const img = document.createElement('img');
                    img.src = res.url;
                    img.setAttribute('data-upload-processed', 'true');

                    // [Fix] 统一新上传时的样式设置
                    const verticalAlign = svg.style.verticalAlign || '-0.25em';

                    if (isInlineMath) {
                        img.setAttribute('class', 'inline-math');
                        // [Fix V5.5] 微调高度：1.25em -> 1.0em (响应用户"小一点"的需求)
                        img.setAttribute('style', `height: 1.0em; vertical-align: ${verticalAlign}; width: auto;`);
                        // [Fix] 显式设置显示尺寸 (HiDPI 适配)
                        img.setAttribute('width', displayWidth.toString());
                        img.setAttribute('height', displayHeight.toString());
                    } else {
                        img.setAttribute('class', 'block-math');
                        img.setAttribute('style', `max-width: 90%; height: auto; display: block; margin: 1em auto;`);
                    }

                    // [Fix] Unwrap mjx-container (MathJax wrapper) as WeChat doesn't support it
                    if (parent && parent instanceof Element && parent.tagName.toLowerCase() === 'mjx-container') {
                        parent.replaceWith(img);
                    } else {
                        svg.replaceWith(img);
                    }
                } else {
                    Logger.error('PostRender', `[uploadSVGs] uploadMaterial failed for SVG.`);
                    // Show error placeholder only if it's likely a math formula we care about
                    if (svg.classList.contains('mjx-svg') || svg.closest('.inline-math, .block-math')) {
                        const errorSpan = document.createElement('span');
                        errorSpan.style.color = 'red';
                        errorSpan.innerText = '[公式上传失败]';
                        svg.replaceWith(errorSpan);
                    }
                }
            } catch (error) {
                Logger.error('PostRender', '[uploadSVGs] Error converting/uploading SVG:', error);
                // Fallback: Try converting SVG to data URL directly (might work in some web views, but not strictly WeChat article)
                // But usually WeChat strips base64 images in articles. Better to show error.
                if (svg.classList.contains('mjx-svg') || svg.closest('.inline-math, .block-math')) {
                    const errorSpan = document.createElement('span');
                    errorSpan.style.color = 'red';
                    errorSpan.innerText = '[公式转换错误]';
                    svg.replaceWith(errorSpan);
                }
            }
        })

        await Promise.all(batchPromises);
    }
}

export async function uploadCanvas(root: HTMLElement, wechatClient: WechatClient): Promise<void> {
    const canvases: HTMLCanvasElement[] = []

    root.querySelectorAll('canvas').forEach(canvas => {
        canvases.push(canvas)
    })

    const uploadPromises = canvases.map(async (canvas) => {
        try {
            const blob = getCanvasBlob(canvas);
            const res = await wechatClient.uploadMaterial(blob, imageFileName(blob.type));
            if (res && res.url) {
                const img = document.createElement('img');
                img.src = res.url;
                img.setAttribute('data-upload-processed', 'true'); // Mark as processed
                canvas.replaceWith(img);
            } else {
                Logger.error('PostRender', `[uploadCanvas] uploadMaterial failed.`);
            }

        } catch (error) {
            Logger.error('PostRender', '[uploadCanvas] Error helper:', error)
        }
    })
    await Promise.all(uploadPromises)
}

export async function uploadURLImage(root: HTMLElement, wechatClient: WechatClient): Promise<void> {
    const images: HTMLImageElement[] = []

    root.querySelectorAll('img').forEach(img => {
        // Skip already processed images (from SVG/Canvas conversion or previous runs)
        if (img.getAttribute('data-upload-processed') === 'true' || img.getAttribute('data-uploaded') === 'true') {
            return;
        }
        // Skip invalid URLs that are clearly not images
        const src = img.src || '';
        if (src.includes('index.html') || src === '' || src === 'about:blank') {
            Logger.warn('PostRender', '[uploadURLImage] Skipping invalid URL:', src);
            img.setAttribute('data-upload-skipped', 'invalid-url');
            return;
        }
        images.push(img)
    })


    const uploadPromises = images.map(async (img) => {
        let blob: Blob | undefined

        // 处理缺失图片标记
        if (img.src.includes('__MISSING_IMAGE__')) {
            const originalPath = img.src.replace(/.*__MISSING_IMAGE__/, '');
            Logger.warn('PostRender', '[uploadURLImage] 图片缺失:', originalPath);

            // 替换为文字提示
            const placeholder = document.createElement('span');
            placeholder.addClass('smart-mp-missing-image');
            placeholder.textContent = `[图片未找到: ${originalPath}]`;
            img.replaceWith(placeholder);
            return;
        }

        if (img.src.includes('://mmbiz.qpic.cn/')) {
            img.setAttribute('data-uploaded', 'true');
            return;
        }
        else if (img.src.startsWith('data:image/')) {
            blob = dataURLtoBlob(img.src);
        } else {
            try {
                blob = await fetchImageBlob(img.src)
            } catch (error) {
                Logger.error('PostRender', `[uploadURLImage] Failed to fetch image: ${img.src}`, error);
                return;
            }
        }

        if (blob === undefined) {
            Logger.error('PostRender', '[uploadURLImage] Failed to get blob for:', img.src);
            return

        } else {

            await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
                if (res && res.url) {
                    img.src = res.url;
                    img.setAttribute('data-upload-processed', 'true');
                    img.setAttribute('data-uploaded', 'true');
                    img.setAttribute('data-uploaded', 'true');
                } else {
                    Logger.error('PostRender', `[uploadURLImage] Upload failed for:`, img.src);
                }
            }).catch(err => {
                Logger.error('PostRender', `[uploadURLImage] Upload exception for: ${img.src}`, err);
            })
        }
    })
    await Promise.all(uploadPromises)
}
// export async function uploadURLBackgroundImage(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
//     const bgEls: Map<string, HTMLElement>  = new Map()
//     root.querySelectorAll('*').forEach(el => {
// 		const style = window.getComputedStyle(el);
// 		const bg = style.getPropertyValue('background-image');
// 		console.log('uploadURLBGImage=>', bg);
// 		if (bg && bg !== 'none') {
// 			const match = bg.match(/url\(["']?(.*?)["']?\)/);
// 			if (match && match[1]) {
// 				bgEls.set(match[1], el as HTMLElement);
// 			}
// 		}

// 	});
//     console.log('-----------------------------------')
//     const uploadPromises = bgEls.forEach((async (el, src) => {
// 		log('uploadURLBGImage eachEls =>', src, el);
//         let blob:Blob|undefined 
//         if (src.includes('://mmbiz.qpic.cn/')){
//             return;
//         }
//         else if (src.startsWith('data:image/')){
// 			console.log('src=>', src);

//             blob = dataURLtoBlob(src);
//         }else{
//             // blob = await fetch(img.src).then(res => res.blob());
//             blob = await fetchImageBlob(src)
//         }

//         if (blob === undefined){
//             console.error(`upload image failed. blob is undefined.`);
//             return

//         }else{
// 			log('uploading blob...', blob.size, blob.type)
//             await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
//                 if (res){
//                     el.style.setProperty("background-image", `url("${res.url}")`)
//                 }else{
//                     console.error(`upload image failed.`);

//                 }
//             })
//         }
//     }))
//     // await Promise.all(uploadPromises)
// }
export async function uploadURLVideo(root: HTMLElement, wechatClient: WechatClient): Promise<void> {
    const videos: HTMLVideoElement[] = []

    root.querySelectorAll('video').forEach(video => {
        videos.push(video)
    })

    const uploadPromises = videos.map(async (video) => {
        let blob: Blob | undefined
        if (video.src.includes('://mmbiz.qpic.cn/')) {
            return;
        }
        else if (video.src.startsWith('data:image/')) {
            blob = dataURLtoBlob(video.src);
        } else {
            blob = await fetchImageBlob(video.src)
        }

        if (blob === undefined) {
            return

        } else {

            await wechatClient.uploadMaterial(blob, imageFileName(blob.type), 'video').then(async res => {
                if (res) {
                    const video_info = await wechatClient.getMaterialById(res.media_id)
                    if (video_info && video_info.url) {
                        video.src = video_info.url
                    }
                } else {
                    Logger.error('PostRender', `upload video failed.`);
                }
            })
        }
    })
    await Promise.all(uploadPromises)
}

export async function convertAssetsToDataURLs(
    root: HTMLElement,
    onProgress?: (current: number, total: number) => void
) {
    const svgs = Array.from(root.querySelectorAll('svg'));
    const canvases = Array.from(root.querySelectorAll('canvas'));
    const images = Array.from(root.querySelectorAll('img'));

    const total = svgs.length + canvases.length + images.length;
    let current = 0;

    const updateProgress = () => {
        current++;
        onProgress?.(current, total);
    };

    const processingTasks: Promise<void>[] = [];

    // 1. Convert SVGs to PNG Base64
    const svgTasks = svgs.map(async (svg) => {
        try {
            // [Fix] Capture actual rendered dimensions
            const rect = svg.getBoundingClientRect();
            const width = rect.width || 300;
            const height = rect.height || 150;

            // Keep xmlns for valid SVG image source
            let svgString = serializeElement(svg, true);

            // [Fix] Robust SVG Sanitization (Same as uploadSVGs)
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            // Force dimensions
            if (svgString.match(/ width="[^"]*"/)) {
                svgString = svgString.replace(/ width="[^"]*"/, ` width="${width}"`);
            } else {
                svgString = svgString.replace('<svg', `<svg width="${width}"`);
            }
            if (svgString.match(/ height="[^"]*"/)) {
                svgString = svgString.replace(/ height="[^"]*"/, ` height="${height}"`);
            } else {
                svgString = svgString.replace('<svg', `<svg height="${height}"`);
            }

            svgString = svgString.replace(/var\(--[^)]+\)/g, '#333');
            svgString = svgString.replace(/currentColor/g, '#333');

            const blob = await svgToPng(svgString);
            const reader = new FileReader();
            await new Promise<void>((resolve, reject) => {
                reader.onloadend = () => {
                    const img = document.createElement('img');
                    img.src = reader.result as string;
                    svg.replaceWith(img);
                    resolve();
                };
                reader.onerror = () => {
                    reject(new Error('FileReader error'));
                };
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            Logger.error('PostRender', '[convertAssetsToDataURLs] SVG conversion failed. Replacing with error placeholder.', error);
            // Fallback: simple text to avoid "Image paste failed" error blocking the whole article
            const placeholder = document.createElement('div');
            placeholder.addClass('smart-mp-error-placeholder');
            placeholder.innerText = `⚠️ SVG 图片转换失败`;
            svg.replaceWith(placeholder);
        } finally {
            updateProgress();
        }
    });
    processingTasks.push(...svgTasks);


    // 2. Convert Canvas to PNG Base64
    // Canvas operation is synchronous/fast enough in main thread usually, or we can't really make it async easily without OffscreenCanvas
    canvases.forEach(canvas => {
        try {
            const dataURL = canvas.toDataURL('image/png');
            const img = document.createElement('img');
            img.src = dataURL;
            canvas.replaceWith(img);
        } catch (e) {
            Logger.error('PostRender', '[convertAssetsToDataURLs] Canvas conversion failed:', e);
        } finally {
            updateProgress();
        }
    });

    // 3. Convert Local Images to Base64
    const imageTasks = images.map(async (img) => {
        // Skip already Base64
        if (img.src.startsWith('data:')) {
            updateProgress();
            return;
        }

        try {
            const blob = await fetchImageBlob(img.src);
            const reader = new FileReader();
            await new Promise<void>((resolve, reject) => {
                reader.onloadend = () => {
                    img.src = reader.result as string;
                    resolve();
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            Logger.error('PostRender', `[convertAssetsToDataURLs] Image conversion failed for ${img.src}:`, error);
            // Replace broken image with a text placeholder to avoid WeChat "paste failed" error
            const placeholder = document.createElement('span');
            placeholder.addClass('smart-mp-error-text');
            placeholder.innerText = `[图片加载失败]`;
            img.replaceWith(placeholder);
        } finally {
            updateProgress();
        }
    });
    processingTasks.push(...imageTasks);

    // Wait for all async tasks (SVGs + Images) to complete concurrently
    await Promise.all(processingTasks);

    // 4. Final Sanitize: Remove any remaining images with invalid sources (file://, app://, etc.)
    // These will definitively cause "Image paste failed" in WeChat
    const remainingImages = Array.from(root.querySelectorAll('img'));
    remainingImages.forEach(img => {
        const src = img.getAttribute('src');
        if (!src || (!src.startsWith('http') && !src.startsWith('data:'))) {
            Logger.warn('PostRender', `[convertAssetsToDataURLs] Removing invalid image src after processing: ${src}`);
            const placeholder = document.createElement('span');
            placeholder.style.border = '1px solid #eee';
            placeholder.style.backgroundColor = '#f5f5f5';
            placeholder.style.padding = '4px 8px';
            placeholder.style.color = '#666';
            placeholder.style.fontSize = '12px';
            placeholder.style.borderRadius = '4px';
            // Try to be helpful with the filename if possible
            const name = src ? src.split('/').pop() : 'Invalid Image';
            placeholder.innerText = `[无效图片: ${name}]`;
            img.replaceWith(placeholder);
        }
    });

}
