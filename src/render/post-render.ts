/** 
 * Procesing the image data for a valid WeChat MP article for upload.
 * 
 */
import { $t } from 'src/lang/i18n';
import { fetchImageBlob, serializeElement } from 'src/utils/utils';
import { WechatClient } from './../wechat-api/wechat-client';
import WeWritePlugin from 'src/main';
function imageFileName(mime: string) {
    const type = mime.split('/')[1]
    return `image-${new Date().getTime()}.${type}`
}

const imageCache = new Map<string, string>();
const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash &= hash;
    }
    return new Uint32Array([hash])[0].toString(36);
}
const ERROR_IMAGE_SRC = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23e11d48%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%2F%3E%3Cline%20x1%3D%2215%22%20y1%3D%229%22%20x2%3D%229%22%20y2%3D%2215%22%2F%3E%3Cline%20x1%3D%229%22%20y1%3D%229%22%20x2%3D%2215%22%20y2%3D%2215%22%2F%3E%3C%2Fsvg%3E";
export function svgToPng(svgData: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = img.width * dpr;
            canvas.height = img.height * dpr;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error($t('render.faild-canvas-context')));
                return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error($t('render.failed-to-convert-canvas-to-blob')));
                }
            }, 'image/png');
        };

        img.onerror = () => {
            reject(new Error($t('render.failed-to-load-image')));
        };

        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(svgData);
        let latin1String = '';
        for (const byte of uint8Array) {
            latin1String += String.fromCharCode(byte);
        }
        img.src = `data:image/svg+xml;base64,${btoa(latin1String)}`;
    });
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
        try {
            // WeChat MP does NOT support SVGs. We must convert even small ones or remove them.
            const svgString = serializeElement(svg);

            const hash = simpleHash(svgString);
            if (imageCache.has(hash)) {
                const img = document.createElement('img');
                img.src = imageCache.get(hash)!;
                svg.replaceWith(img);
                return;
            }

            await svgToPng(svgString).then(async blob => {
                await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
                    if (res) {
                        const img = document.createElement('img');
                        img.src = res.url;
                        svg.replaceWith(img);
                        imageCache.set(hash, res.url);
                    } else {
                        console.error(`upload svg failed.`);
                        throw new Error("Upload failed");
                    }
                })
            })
        } catch (error) {
            console.error('Failed to process SVG', error);
            // Remove failing SVGs as they cause "invalid content" errors on WeChat
            if (svg && svg.parentNode) {
                svg.remove();
            }
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
            const pngDataUrl = canvas.toDataURL('image/png');
            const hash = simpleHash(pngDataUrl);

            if (imageCache.has(hash)) {
                const img = document.createElement('img');
                img.src = imageCache.get(hash)!;
                canvas.replaceWith(img);
                return;
            }

            const blob = dataURLtoBlob(pngDataUrl);
            await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
                if (res) {
                    const img = document.createElement('img');
                    img.src = res.url;
                    canvas.replaceWith(img);
                    imageCache.set(hash, res.url);
                } else {
                    console.error('upload canvas failed');
                    throw new Error("Upload failed");
                }
            })
        } catch (error) {
            console.error('Failed to process Canvas', error);
            // Remove failing canvas as it would be serialized to nothing or problematic HTML
            if (canvas && canvas.parentNode) {
                canvas.remove();
            }
        }
    })
    await Promise.all(uploadPromises)
}

export async function uploadURLImage(root: HTMLElement, wechatClient: WechatClient): Promise<void> {
    const images: HTMLImageElement[] = []

    root.querySelectorAll('img').forEach(img => {
        if (!img.src || img.src === "" || img.src.includes('undefined') || img.src.includes('null')) {
            img.remove();
            return;
        }
        images.push(img)
    })

    const uploadPromises = images.map(async (img) => {
        try {
            if (img.src.includes('://mmbiz.qpic.cn/')) {
                return;
            }

            const key = img.src.startsWith('data:') ? simpleHash(img.src) : img.src;

            if (imageCache.has(key)) {
                img.src = imageCache.get(key)!;
                return;
            }

            let blob: Blob | undefined
            if (img.src.startsWith('data:image/')) {
                blob = dataURLtoBlob(img.src);
            } else {
                // blob = await fetch(img.src).then(res => res.blob());
                blob = await fetchImageBlob(img.src)
                // try {
                //     const response = await requestUrl(img.src);
                //     if (!response.arrayBuffer) {
                //         console.error(`Failed to fetch image from ${img.src}`);
                //         return;
                //     }
                //     blob = new Blob([response.arrayBuffer]);
                // } catch (error) {
                //     console.error(`Error fetching image from ${img.src}:`, error);
                //     return;
                // }
            }

            if (blob === undefined || blob.size === 0) {
                console.error(`Blob is invalid or empty for ${img.src}`);
                img.remove();
                return;
            } else {
                const res = await wechatClient.uploadMaterial(blob, imageFileName(blob.type));
                if (res) {
                    img.src = res.url
                    imageCache.set(key, res.url);
                } else {
                    console.error(`upload image failed for ${img.src}`);
                    img.remove();
                }
            }
        } catch (error) {
            console.error('Failed to process Image', img.src, error);
            // If it's a local app:// URL that failed to upload, we MUST remove it or WeChat will reject the article.
            // Data URLs are also risky.
            img.remove();
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
                    video.src = video_info.url
                } else {
                    console.error(`upload video failed.`);

                }
            })
        }
    })
    await Promise.all(uploadPromises)
}
