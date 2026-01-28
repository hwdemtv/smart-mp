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
        const svgString = serializeElement(svg);
        if (svgString.length < 1000) {
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
