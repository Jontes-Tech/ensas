import axios from 'axios';
import sharp from 'sharp';

import { minioClient } from '../misc/minio';

// /**
//  * Get an image from S3 or fetch it from the internet. May return undefined if the image is not found and could not be fetched.
//  * @param imageURL - The URL of the image
//  * @param size - The size of the image
//  * @param format - The format of the image
//  */
export const handleNotFound = async (
    fileURL: string,
    size: number,
    format: 'jpg' | 'webp',
) => {
    try {
        const response = await axios(fileURL, {
            headers: {
                'User-Agent': 'ENS Avatar Service <jonatan@jontes.page>',
            },
            maxContentLength: 16 * 1024 * 1024,
            timeout: 10_000,
            maxBodyLength: 16 * 1024 * 1024,
            responseType: 'arraybuffer',
            maxRedirects: 5,
        }).catch((error) => {
            throw new Error('Axios Errror: ' + error.cause);
        });

        if (!response || !response.data || response.data.byteLength === 0) {
            return;
        }

        if (format === 'jpg') {
            return {
                buffer: await sharp(response.data, {
                    animated: true,
                })
                    .resize({
                        width: size,
                        height: size,
                        fit: 'cover',
                        position: 'center',
                    })
                    .jpeg()
                    .toBuffer()
                    .catch(() => {}),
                originalBuffer: response.data,
            };
        }

        return {
            buffer: await sharp(response.data, {
                animated: true,
            })
                .resize({
                    width: size,
                    height: size,
                    fit: 'cover',
                    position: 'center',
                })
                .webp()
                .toBuffer()
                .catch(() => {}),
            originalBuffer: response.data,
        };
    } catch {
        return {
            buffer: undefined,
            originalBuffer: undefined,
        };
    }
};

type ReturnType = {
    age: number;
    buffer?: Buffer;
    originalBuffer?: ArrayBuffer;
};

const thePromise = (stream: any) =>
    new Promise((resolve) => {
        const chunks: any[] = [];
        let age = 0;

        stream.on('data', (chunk: any) => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            // @ts-ignore
            age = Date.now() - new Date(stream.headers['last-modified']);

            return resolve({
                buffer: Buffer.concat(chunks),
                age,
            });
        });
    });

// /**
//  * 3 scenarios, strap in:
//  * 1. Image is found in S3 (and is returned, featuring a buffer and an age)
//  * 2. Image is not found in S3, fetch succeeds (returns buffer and originalBuffer, as well as age set to 0)
//  * 3. Image is not found in S3, fetch fails (throws an error) - This function is not responsible for handling this error
//  * @param imageURL - The URL of the image
//  * @param size - The size of the image
//  * @param format - The format of the image
//  */

export const getImage = async (
    imageURL: string,
    size: number,
    format: 'webp' | 'jpg',
): Promise<ReturnType> => {
    let originalBuffer: ArrayBuffer | undefined;

    const stream = await minioClient
        .getObject(
            process.env.BUCKET_NAME || '',
            (format === 'webp' ? size : size + '_legacy') +
                '/' +
                encodeURIComponent(imageURL),
        )
        .catch(async (error) => {
            if (error.code === 'NoSuchKey') {
                const response = await handleNotFound(
                    imageURL,
                    size,
                    format,
                ).catch((error_) => {
                    console.error('Error in handleNotFound: ' + error_);
                });

                if (response) {
                    ({ originalBuffer } = response);

                    return response.buffer;
                }

                return;
            }

            console.error(error);
        });

    if (Buffer.isBuffer(stream)) {
        return {
            age: 0,
            buffer: stream,
            originalBuffer,
        };
    }

    if (stream) {
        return (await thePromise(stream)) as ReturnType;
    }

    throw new Error('Could not fetch image');
};
