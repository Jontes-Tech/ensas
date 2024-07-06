import * as Minio from 'minio';

export const minioClient = new Minio.Client({
    endPoint: process.env.BUCKET_HOST || 'localhost',
    port: Number.parseInt(process.env.BUCKET_PORT || '9000'),
    useSSL: process.env.BUCKET_USE_SSL === 'true',
    accessKey: process.env.AWS_ACCESS_KEY_ID || '',
    secretKey: process.env.AWS_SECRET_ACCESS_KEY || '',
});
