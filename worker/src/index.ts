import mq from 'amqplib/callback_api';
import axios from 'axios';
import { minioClient } from './minio';
import sharp from 'sharp';

const handleFile = async (file: string) => {
    const response = await axios(file, {
        headers: {
            'User-Agent': 'ENS Avatar Service (revalidator) <jonatan@jontes.page>',
        },
        maxContentLength: 16 * 1024 * 1024,
        timeout: 10_000,
        maxBodyLength: 16 * 1024 * 1024,
        responseType: 'arraybuffer',
        maxRedirects: 5,
    });

    if (!response || !response.data || response.data.byteLength === 0) {
        return;
    }

    const formats = [
        {
            format: 'jpeg',
            size: 64,
            name: "64_legacy"
        },
        {
            format: 'webp',
            size: 64,
            name: "64"
        },
        {
            format: 'webp',
            size: 128,
            name: "128"
        },
        {
            format: 'webp',
            size: 256,
            name: "256"
        },
    ] as const;

    formats.forEach(async (format) => {
        const image = await sharp(response.data, {
            animated: true,
        })
            .resize(format.size, format.size)
            .toFormat(format.format)
            .toBuffer();

        await minioClient.putObject(
            process.env.BUCKET_NAME || 'ens-avatar',
            format.name + '/' + encodeURIComponent(file),
            image,
            image.length,
            {
                'Content-Type': 'image/'+format.format,
            },
        );
    });
};

await new Promise((resolve) => setTimeout(resolve, 10_000));
console.log(process.env.AMQP)

mq.connect(process.env.AMQP || "amqp://localhost", (err, conn) => {
    if (err) throw err;
    conn.createChannel((err, ch) => {
        if (err) throw err;
        ch.assertQueue('ensas_queue');
        ch.consume('ensas_queue', async (msg) => {
            if (msg === null) return;

            await handleFile(msg.content.toString());

            ch.ack(msg);
        });
    });
});
