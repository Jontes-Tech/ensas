import axios from 'axios';

import { resizeAndUpload } from './resizeAndUpload';

export const populateCache = async (
    originalBuffer: ArrayBuffer | undefined,
    fileURL: string,
    age: number,
) => {
    // If file is not in cache, upload it
    if (originalBuffer && originalBuffer.byteLength > 0) {
        resizeAndUpload(originalBuffer, fileURL);
    }

    // If the file is older than 5 days, fetch it again
    if (age > 1000 * 60 * 60 * 24 * 5) {
        const populateCacheResponse = await axios(fileURL, {
            headers: {
                'User-Agent': 'ENS Avatar Service <jonatan@jontes.page>',
            },
            maxContentLength: 50 * 1024 * 1024,
            timeout: 60_000,
            responseType: 'arraybuffer',
        }).catch((error) => {
            console.error(error);
        });

        if (!populateCacheResponse) {
            return;
        }

        const arrayBuffer = await populateCacheResponse.data;

        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return;
        }

        resizeAndUpload(arrayBuffer, fileURL);
    }
};
