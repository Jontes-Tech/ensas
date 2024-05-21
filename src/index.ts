import axios from "axios"
import express from "express";
import * as Minio from "minio";
import sharp from "sharp";
import { v4 } from "uuid";

const app = express();
app.set("etag", false);

const minioClient = new Minio.Client({
	endPoint: process.env.BUCKET_HOST || "localhost",
	port: Number.parseInt(process.env.BUCKET_PORT || "9000"),
	useSSL: process.env.BUCKET_USE_SSL === "true",
	accessKey: process.env.AWS_ACCESS_KEY_ID || "",
	secretKey: process.env.AWS_SECRET_ACCESS_KEY || "",
});

const sizes = [64, 128, 256];

const resizeAndUpload = (
	imageBuffer: ArrayBuffer,
	fileURL: string,
	correlationID: string
) => {
	sizes.forEach(async (size) => {
		const image = await sharp(imageBuffer, {
			animated: true,
		})
			.resize(size, size)
			.webp()
			.toBuffer();

		await minioClient.putObject(
			process.env.S3_BUCKET || "ens-avatar",
			size + "/" + encodeURIComponent(fileURL),
			image,
			image.length,
			{
				"Content-Type": "image/webp",
			},
		);
	});

	(async () => {
		const image = await sharp(imageBuffer)
			.resize(64, 64)
			.jpeg()
			.toBuffer();
		await minioClient.putObject(
			process.env.S3_BUCKET || "ens-avatar",
			"64_legacy/" + encodeURIComponent(fileURL),
			image,
			image.length,
			{
				"Content-Type": "image/jpeg",
			},
		);
	})();

	console.log(`resized and uploaded (${correlationID}): ${fileURL}`);
};

const userError = (res: express.Response, size: number) => {
		res.setHeader("Content-Type", "image/svg+xml");
		res.send(`<?xml version="1.0" standalone="no"?>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="${size}px" width="${size}px">
      <defs>
        <linearGradient id="0" x1="0.66" y1="0.03" x2="0.34" y2="0.97">
          <stop offset="1%" stop-color="#5298ff"/>
          <stop offset="51%" stop-color="#5298ff"/>
          <stop offset="100%" stop-color="#5298ff"/>
        </linearGradient>
      </defs>
      <rect fill="url(#0)" height="100%" width="100%"/>
    </svg>`);
		return;
}

const getAvatarURL = async (name: string, correlationID: string) => {
	const start = performance.now();
	try {
		const response = await fetch(`${process.env.ENSTATE_URL || "https://enstate.rs/"}/n/${name}`);
		const data = await response.json();
		console.log(`${process.env.ENSTATE_URL} (${correlationID}): ${performance.now() - start}ms`);
		return (data.avatar || "").toString();
	} catch (e) {
		console.log(`error (${correlationID}): ${e}`);
		return "";
	}
};

app.get("/:size/:image.:format", async (req, res) => {
	const correlationID = v4();

	// These errors shouldn't be graceful, as they are developer errors (and not user errors)
	if (req.params.format !== "webp" && req.params.format !== "jpg") {
		res.json({
			error: "Invalid format",
		});
	}

	if (req.params.format === "jpg" && req.params.size !== "64") {
		res.json({
			error: "Invalid size for jpg",
		});
	}

	if (!sizes.includes(Number.parseInt(req.params.size))) {
		res.json({
			error: "Invalid size",
		});
	}

	const bucket = process.env.BUCKET_NAME || "ens-avatar";

	console.log(bucket);

	let fileURL = await getAvatarURL(req.params.image, correlationID);

	// Assume cache hit, change to MISS if we fetch the image
	res.setHeader("X-Cache", "HIT")

	if (!fileURL) {
		userError(res, Number.parseInt(req.params.size));
		return;
	}

	const ipfs = /\/ipfs\/(.*)/;
	if (ipfs.test(new URL(fileURL).pathname)) {
		console.log(`ipfs (${correlationID}): ${fileURL}`);
		res.setHeader("x-ipfs-path", new URL(fileURL).pathname);
		fileURL = `https://cloudflare-ipfs.com${new URL(fileURL).pathname}`;
	}

	console.log(`fileURL: ${fileURL}`);

	let arrayBuffer: ArrayBuffer | undefined;
	let age = 0;
	const fileStream = await minioClient
		.getObject(bucket, (req.params.format === "webp" ? req.params.size : req.params.size + "_legacy") + "/" + encodeURIComponent(fileURL))
		.catch(async (e) => {
			if (e.code === "NoSuchKey") {
				res.setHeader("X-Cache", "MISS");
				const response = await axios(fileURL, {
					headers: {
						"User-Agent": "ENS Avatar Service <jonatan@jontes.page>",
					},
					maxContentLength: 50 * 1024 * 1024,
					timeout: 10000,
					responseType: "arraybuffer",
				}).catch((e) => {
					console.log(`axios error (${correlationID}): ${e}`);
					userError(res, Number.parseInt(req.params.size));
					return;
				})

				if (!response) {
					return;
				}

				arrayBuffer = response.data;

				console.log(`fetch (${correlationID}): ${response.status}`);

				if (!arrayBuffer || arrayBuffer.byteLength === 0) {
					userError(res, Number.parseInt(req.params.size));
					return;
				}

				if (req.params.format === "jpg") {
					return await sharp(arrayBuffer)
						.resize(
							Number.parseInt(req.params.size),
							Number.parseInt(req.params.size),
						)
						.jpeg()
						.toBuffer()
						.catch((e) => {
							console.log(`sharp error (${correlationID}): ${e}`);
							userError(res, Number.parseInt(req.params.size));
							return;
						});
				}

				return await sharp(arrayBuffer, {
					animated: true,
				})
					.resize(
						Number.parseInt(req.params.size),
						Number.parseInt(req.params.size),
					)
					.webp()
					.toBuffer()
					.catch((e) => {
						console.log(`sharp error (${correlationID}): ${e}`);
						res.json({
							error: "Could not process image, maybe Sharp doesn't support this format?",
						});
						return;
					});
			}
		}).then((stream) => {
			if (Buffer.isBuffer(stream)) {
				return stream;
			}
			if (stream) {
				return new Promise((resolve, reject) => {
					const chunks: any[] = [];
					stream.on("data", (chunk) => {
						chunks.push(chunk);
					});
					stream.on("end", () => {
						// @ts-ignore
						age = new Date() - new Date(stream.headers["last-modified"]);
						resolve(Buffer.concat(chunks));
					});
					stream.on("error", reject);
				});
			}
			return undefined;
		})

	if (req.params.format === "jpg") {
		res.setHeader("Content-Type", "image/jpeg");
	}
	else {
		res.setHeader("Content-Type", "image/webp");
	}
	
	res.setHeader("Cache-Control", "public, max-age=604800");
	res.setHeader("Age", (age / 1000).toFixed().toString());

	res.send(fileStream);

	if (arrayBuffer && arrayBuffer.byteLength > 0) {
		resizeAndUpload(arrayBuffer, fileURL, correlationID);
	}

	if (age > 1000 * 60 * 60 * 24 * 5) {
		const response = await axios(fileURL, {
			headers: {
				"User-Agent": "ENS Avatar Service <jonatan@jontes.page>",
			},
			maxContentLength: 50 * 1024 * 1024,
			timeout: 60000,
			responseType: "arraybuffer",
		}).catch((e) => {
			console.log(`axios error (${correlationID}): ${e}`);
			return;
		});

		if (!response) {
			return;
		}

		const arrayBuffer = await response.data;

		if (!arrayBuffer || arrayBuffer.byteLength === 0) {
			return;
		}

		resizeAndUpload(arrayBuffer, fileURL, correlationID);
	}

	console.log(`served (${correlationID}): ${req.params.image}`);
});

app.get("/", (req, res) => {
	res.setHeader("Content-Type", "text/html");
	res.send(`<!DOCTYPE html>
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
		<p><a target="_blank" href="https://avatarservice.xyz/64/jontes.eth.webp">https://avatarservice.xyz/64/jontes.eth.webp</a></p>
		<p><a target="_blank" href="https://avatarservice.xyz/128/luc.eth.webp">https://avatarservice.xyz/128/luc.eth.webp</a></p>
		<p><a target="_blank" href="https://avatarservice.xyz/256/helgesson.eth.webp">https://avatarservice.xyz/256/helgesson.eth.webp</a></p>
		<footer>
			A public good for the community (<a href="mailto:jonatan@jontes.page">report concerns</a>)
		</footer>
	</body>
	</html>`)
}) 

app.listen(3000, () => {
	console.log("Server running on port 3000");
});
