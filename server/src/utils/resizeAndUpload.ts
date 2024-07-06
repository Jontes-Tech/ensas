import sharp from 'sharp';

import { bucket, sizes } from '../constants';
import { minioClient } from '../misc/minio';

// JSDOC

/**
 * Resize and upload an image to S3
 * @param imageBuffer - The image buffer to resize and upload
 * @param fileURL - The URL of the file to upload (used as the key)
 */
export const resizeAndUpload = (imageBuffer: ArrayBuffer, fileURL: string) => {
    (async () => {
        for (const size of sizes) {
            const image = await sharp(imageBuffer, {
                animated: true,
            })
                .resize(size, size)
                .webp()
                .toBuffer();

            await minioClient.putObject(
                bucket,
                size + '/' + encodeURIComponent(fileURL),
                image,
                image.length,
                {
                    'Content-Type': 'image/webp',
                },
            );
        }

        const image = await sharp(imageBuffer).resize(64, 64).jpeg().toBuffer();

        await minioClient.putObject(
            process.env.S3_BUCKET || 'ens-avatar',
            '64_legacy/' + encodeURIComponent(fileURL),
            image,
            image.length,
            {
                'Content-Type': 'image/jpeg',
            },
        );
    })();
};
