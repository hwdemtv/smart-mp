/** 
 * Procesing the image data for a valid WeChat MP article for upload.
 * 
 */
import { $t } from 'src/lang/i18n';
import { fetchImageBlob, serializeElement } from 'src/utils/utils';
import { WechatClient } from './../wechat-api/wechat-client';
import SmartMPPlugin from 'src/main';
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
            console.warn('[svgToPng] Image load error:', e);
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

export async function uploadSVGs(root: HTMLElement, wechatClient: WechatClient) {
    const svgs: SVGSVGElement[] = []
    root.querySelectorAll('svg').forEach(svg => {
        svgs.push(svg)
    })

    const uploadPromises = svgs.map(async (svg) => {
        const svgString = serializeElement(svg);
        // 之前的阈值 1000 太高，导致简单的 Icon (300-500 chars) 被跳过
        // 调整为 150 以允许大多数合法的小图标，同时过滤极短的空 SVG
        if (svgString.length < 150) {
            console.warn('[uploadSVGs] SVG too small, skipping:', svgString.length);
            return Promise.resolve();
        }
        try {
            const blob = await svgToPng(svgString);
            const res = await wechatClient.uploadMaterial(blob, imageFileName(blob.type));
            if (res && res.url) {
                const img = document.createElement('img');
                img.src = res.url;
                img.setAttribute('data-upload-processed', 'true'); // Mark as processed
                svg.replaceWith(img);
            } else {
                console.error(`[uploadSVGs] uploadMaterial failed for SVG.`);
            }
        } catch (error) {
            console.error('[uploadSVGs] Error converting/uploading SVG:', error);
        }
    })

    await Promise.all(uploadPromises)
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
                console.error(`[uploadCanvas] uploadMaterial failed.`);
            }

        } catch (error) {
            console.error('[uploadCanvas] Error helper:', error)
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
        images.push(img)
    })

    console.log('[uploadURLImage] Found', images.length, 'images to upload');

    const uploadPromises = images.map(async (img) => {
        console.log('[uploadURLImage] Processing:', img.src);
        let blob: Blob | undefined
        if (img.src.includes('://mmbiz.qpic.cn/')) {
            console.log('[uploadURLImage] Skip WeChat CDN');
            img.setAttribute('data-uploaded', 'true');
            return;
        }
        else if (img.src.startsWith('data:image/')) {
            console.log('[uploadURLImage] Data URL');
            blob = dataURLtoBlob(img.src);
        } else {
            console.log('[uploadURLImage] Fetching blob...');
            try {
                blob = await fetchImageBlob(img.src)
            } catch (error) {
                console.error(`[uploadURLImage] Failed to fetch image: ${img.src}`, error);
                return;
            }
        }

        if (blob === undefined) {
            console.error('[uploadURLImage] Failed to get blob for:', img.src);
            return

        } else {

            await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
                if (res && res.url) {
                    console.log('[uploadURLImage] Uploaded! New URL:', res.url);
                    img.src = res.url;
                    img.setAttribute('data-upload-processed', 'true');
                    img.setAttribute('data-uploaded', 'true');
                    img.setAttribute('data-uploaded', 'true');
                } else {
                    console.error(`[uploadURLImage] Upload failed for:`, img.src);
                }
            }).catch(err => {
                console.error(`[uploadURLImage] Upload exception for: ${img.src}`, err);
            })
        }
    })
    await Promise.all(uploadPromises)
    console.log('[uploadURLImage] All done');
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
                    video.src = video_info.url
                } else {
                    console.error(`upload video failed.`);

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

    // 1. Convert SVGs to PNG Base64
    await Promise.all(svgs.map(async (svg) => {
        try {
            // Keep xmlns for valid SVG image source
            const svgString = serializeElement(svg, true);
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
            console.error('[convertAssetsToDataURLs] SVG conversion failed. Replacing with error placeholder.', error);
            // Fallback: simple text to avoid "Image paste failed" error blocking the whole article
            const placeholder = document.createElement('div');
            placeholder.style.border = '1px dashed red';
            placeholder.style.padding = '10px';
            placeholder.innerText = `⚠️ SVG 图片转换失败`;
            svg.replaceWith(placeholder);
        } finally {
            updateProgress();
        }
    }));

    // 2. Convert Canvas to PNG Base64
    canvases.forEach(canvas => {
        try {
            const dataURL = canvas.toDataURL('image/png');
            const img = document.createElement('img');
            img.src = dataURL;
            canvas.replaceWith(img);
        } catch (e) {
            console.error('[convertAssetsToDataURLs] Canvas conversion failed:', e);
        } finally {
            updateProgress();
        }
    });

    // 3. Convert Local Images to Base64
    await Promise.all(images.map(async (img) => {
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
            console.error(`[convertAssetsToDataURLs] Image conversion failed for ${img.src}:`, error);
            // Replace broken image with a text placeholder to avoid WeChat "paste failed" error
            const placeholder = document.createElement('span');
            placeholder.style.color = 'red';
            placeholder.style.fontSize = '12px';
            placeholder.innerText = `[图片加载失败]`;
            img.replaceWith(placeholder);
        } finally {
            updateProgress();
        }
    }));

    // 4. Final Sanitize: Remove any remaining images with invalid sources (file://, app://, etc.)
    // These will definitively cause "Image paste failed" in WeChat
    const remainingImages = Array.from(root.querySelectorAll('img'));
    remainingImages.forEach(img => {
        const src = img.getAttribute('src');
        if (!src || (!src.startsWith('http') && !src.startsWith('data:'))) {
            console.warn(`[convertAssetsToDataURLs] Removing invalid image src after processing: ${src}`);
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
