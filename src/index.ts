/* eslint-disable sonarjs/no-duplicate-string */
import express from 'express';

import { getAvatarURL } from './utils/getAvatarURL';
import { getImage } from './utils/getImage';
import { userError } from './utils/handleUserError';
import { performSanityCheck } from './utils/performSanityCheck';
import { populateCache } from './utils/populateCache';

const app = express();

app.set('etag', false);

app.use((request, _response, next) => {
    const { url } = request;

    console.log(`${new Date().toISOString()} GET ${url}`);

    next();
});

app.get('/:size/:image.:format', async (request, response) => {
    try {
        response.setHeader('X-Cache', 'HIT');

        const sanityCheckError = performSanityCheck(
            request.params.size,
            request.params.format,
        );

        if (sanityCheckError) {
            response.json({
                error: sanityCheckError,
            });

            return;
        }

        let fileURL = await getAvatarURL(request.params.image);

        if (!fileURL) {
            throw new Error('Failed to fetch avatar URL');
        }

        const ipfs = /\/ipfs\/(.*)/;

        if (ipfs.test(new URL(fileURL).pathname)) {
            response.setHeader('x-ipfs-path', new URL(fileURL).pathname);
            fileURL =
                (process.env.IPFS_GATEWAY || 'https://ipfs.io') +
                new URL(fileURL).pathname;
        }

        const image = await getImage(
            fileURL,
            Number.parseInt(request.params.size),
            request.params.format as 'webp' | 'jpg',
        );

        if (!image || !image.buffer) {
            throw new Error('Image buffer is missing');
        }

        if (image.originalBuffer) {
            // Because we have an original buffer, we know that the image was in fact fetched in this request
            response.setHeader('X-Cache', 'MISS');
        }

        const { buffer, age, originalBuffer } = image;

        if (request.params.format === 'jpg') {
            response.setHeader('Content-Type', 'image/jpeg');
        } else {
            response.setHeader('Content-Type', 'image/webp');
        }

        response.setHeader('Cache-Control', 'public, max-age=604800');
        response.setHeader('Age', (age / 1000).toFixed(0).toString());

        response.send(buffer);

        populateCache(originalBuffer, fileURL, age);
    } catch (error) {
        console.error(error);
        userError(response, Number.parseInt(request.params.size));
    }
});

app.get('/', (request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.send(`<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>AvatarService</title>
		<link rel="stylesheet" href="https://cdn.simplecss.org/simple.min.css">
	</head>
	<body>
		<header>
			<h1>AvatarService.xyz</h1>
			<p>A public good for accessing ENS profile pictures effiently</p>
		</header>
		<p>This service is a public good for those who do not wish to make arbritary web requests to random webservers users have specified. We proxy any ENS names' avatars, and resize them to your liking.</p>
		<code>https://avatarservice.xyz/RESOLUTION/ETHNAME.webp</code>
		<p>Where RESOLUTION is either 64, 128 or 256 and ETHNAME is the ENS name you want to search for.</p>
		<a target="_blank" href="/64/jontes.eth.webp">avatarservice.xyz/64/jontes.eth.webp</a>
		<a target="_blank" href="/128/luc.eth.webp">avatarservice.xyz/128/luc.eth.webp</a>
		<a target="_blank" href="/256/helgesson.eth.webp">avatarservice.xyz/256/helgesson.eth.webp</a>
		<footer>
			A public good for the community (<a href="mailto:jonatan@jontes.page">report concerns</a>)
		</footer>
	</body>
	</html>`);
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
}).setTimeout(30_000);
