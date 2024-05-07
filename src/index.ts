import express from "express";
import * as Minio from "minio";
import sharp from "sharp";
import { v4 } from "uuid";

const app = express();

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
	correlationID: string,
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
			size+"/"+encodeURIComponent(fileURL),
			image,
			image.length,
			{
				"Content-Type": "image/webp",
			},
		);
	});
	console.log(`resized and uploaded (${correlationID}): ${fileURL}`);
};

const getAvatarURL = async (name: string, correlationID: string) => {
	const start = performance.now();
	const response = await fetch(`https://enstate.rs/n/${name}`);
	const data = await response.json();
	console.log(`enstate (${correlationID}): ${performance.now() - start}ms`);
	return (data.avatar || "").toString();
};

app.get("/:size/:image.webp", async (req, res) => {
	const correlationID = v4();

	if (!sizes.includes(Number.parseInt(req.params.size))) {
		res.json({
			error: "Invalid size",
		});
	}

	const bucket = process.env.BUCKET_NAME || "ens-avatar";

	console.log(bucket)

	const fileURL = await getAvatarURL(req.params.image, correlationID);

	console.log(`fileURL: ${fileURL}`);

	if (!fileURL) {
		res.setHeader("Content-Type", "image/svg+xml");
		res.send(`<?xml version="1.0" standalone="no"?>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="${req.params.size}px" width="${req.params.size}px">
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

	let arrayBuffer: ArrayBuffer | undefined;
	const fileStream = await minioClient
		.getObject(bucket, req.params.size+"/"+encodeURIComponent(fileURL))
		.catch(async (e) => {
			if (e.code === "NoSuchKey") {
				const preFetch = performance.now();
				const response = await fetch(fileURL);
				console.log(
					`image fetch (${correlationID}): ${performance.now() - preFetch}ms`,
				);

				arrayBuffer = await response.arrayBuffer();

				if (!arrayBuffer) {
					res.json({
						error: "File not found",
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
					.toBuffer();
			}
		});

	if (!fileStream || typeof fileStream === "undefined") {
		res.json({
			error: "File not found",
		});
	}

	res.setHeader("Content-Type", "image/webp");
	res.setHeader("Cache-Control", "public, max-age=604800");
	if (Buffer.isBuffer(fileStream)) {
		res.setHeader("X-Cache", "MISS");
		console.log(`cache miss (${correlationID}): ${req.params.image}`);
		res.send(fileStream);
	} else if (fileStream) {
		res.setHeader("X-Cache", "HIT");
		console.log(`cache hit (${correlationID}): ${req.params.image}`);
		fileStream.pipe(res);
	}

	if (arrayBuffer) {
		resizeAndUpload(arrayBuffer, fileURL, correlationID);
	}
	console.log(`served (${correlationID}): ${req.params.image}`);
});

app.listen(3000, () => {
	console.log("Server running on port 3000");
});
