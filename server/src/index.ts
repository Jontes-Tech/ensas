/* eslint-disable sonarjs/no-duplicate-string */
import express from 'express';
import pino from 'pino';

import { getAvatarURL } from './utils/getAvatarURL';
import { getImage } from './utils/getImage';
import { userError } from './utils/handleUserError';
import { performSanityCheck } from './utils/performSanityCheck';
import { populateCache } from './utils/populateCache';
import { resizeAndUpload } from './utils/resizeAndUpload';

const logger = pino(
    { level: 'info' },
    pino.transport({
        target: '@axiomhq/pino',
        options: {
            dataset: 'avatarservice',
            token: process.env.AXIOM_TOKEN,
        },
    }),
);

const app = express();

app.set('etag', false);

app.get('/:size/:image.:format', async (request, response) => {
    try {
        console.log(request.params.image);

        if (request.params.format === 'jpeg') {
            response.redirect(
                301,
                `/${request.params.size}/${request.params.image}.jpg`,
            );
        }

        response.setHeader('X-Cache', 'HIT');

        const sanityCheckError = performSanityCheck(
            request.params.size,
            request.params.format,
        );

        if (sanityCheckError) {
            response.json({
                error: sanityCheckError,
            });

            logger.error(
                {
                    error: sanityCheckError,
                },
                'Sanity check failed',
            );

            return;
        }

        let fileURL = await getAvatarURL(request.params.image.toLowerCase());

        if (!fileURL) {
            throw new Error(
                'Failed to fetch avatar URL from ENState with name: ' +
                    request.params.image,
            );
        }

        const ipfs = /\/ipfs\/(.*)/;

        if (ipfs.test(new URL(fileURL).pathname)) {
            response.setHeader('x-ipfs-path', new URL(fileURL).pathname);

            let gateway = process.env.IPFS_GATEWAY || 'https://ipfs.io';

            if (gateway.includes(',')) {
                const gateways = gateway.split(',');

                gateway = gateways[Math.floor(Math.random() * gateways.length)];
            }

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

        const { buffer, age, status } = image;
        const ip = request.headers['CF-Connecting-IP'];

        logger.info(
            {
                size: request.params.size,
                format: request.params.format,
                name: request.params.image,
                ip,
            },
            `Image was${status === 'MISS' ? ' not ' : ' '}found in cache`,
        );

        response.setHeader('X-Cache', status);

        if (request.params.format === 'jpg') {
            response.setHeader('Content-Type', 'image/jpeg');
        } else {
            response.setHeader('Content-Type', 'image/webp');
        }

        response.setHeader('Cache-Control', 'public, max-age=604800');
        response.setHeader('Age', (age / 1000).toFixed(0).toString());

        response.send(buffer);

        populateCache(fileURL, age);
    } catch (error) {
        logger.error(
            {
                // @ts-ignore
                error: error.message,
                ip: request.headers['CF-Connecting-IP'],
                url: request.url,
            },
            'Error in request',
        );
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

app.post('/bulk', async (request, response) => {
    const { names } = request.body as { names: string[] };

    if (!names || !Array.isArray(names) || names.length === 0) {
        response.status(400).send('Invalid request body');

        return;
    }

    if (names.length > 100) {
        response
            .status(400)
            .send(
                'While we appreciate your enthusiasm, we can only process 100 names at a time',
            );

        return;
    }

    let url = 'https://enstate.rs/bulk/n?ref=avatarservice';

    for (const name of names) {
        url += `&names[]=${name}`;
    }

    const enstateResponse = await fetch(url);
    const json = (await enstateResponse.json()) as {
        response_length: number;
        response: {
            type?: string;
            avatar?: string;
        }[];
    };

    for (const name of json.response) {
        if (name.avatar) {
            await resizeAndUpload(name.avatar);
        }
    }

    response.send('Processing bulk request');
});

const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});

process.on('SIGTERM', () => {
    server.close();
});
