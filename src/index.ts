import express from 'express'
import * as Minio from 'minio'
import sharp from 'sharp'

const app = express()

const minioClient = new Minio.Client({
  endPoint: '10.89.0.2',
  port: 9000,
  useSSL: false,
  // Very secure credentials 😎
  accessKey: 'LjwAHpsnPjgkZY2BVn6H',
  secretKey: 'smD2H1WhVdMWgm8IyM47eXah2T1HNwR7mTA8Gnvx',
})

const sizes = [128,256]

const resizeAndUpload = (imageBuffer: ArrayBuffer, fileURL: string) => {
  sizes.forEach(async (size) => {
    const image = await sharp(imageBuffer).resize(size, size).webp().toBuffer()

    await minioClient.putObject('ens-avatar-' + size, encodeURIComponent(fileURL), image, image.length, {
      'Content-Type': 'image/webp'
    })
  })
}

const getAvatarURL = async (name: string) => {
  const response = await fetch("https://enstate.rs/n/" + name)
  const data = await response.json()
  return (data.avatar || "").toString()
}

app.get('/:size/:image.webp', async (req, res) => {
  console.log('Requesting image', req.params.image, 'with size', req.params.size)
  if (!sizes.includes(parseInt(req.params.size))) {
    res.json({
      error: 'Invalid size',
    })
  }

  const bucket = 'ens-avatar-' + req.params.size

  const fileURL = await getAvatarURL(req.params.image)

  if (!fileURL) {
    res.json({
      error: 'Invalid ENS name',
    })
  }

  res.setHeader("X-Cache", "HIT")

  let arrayBuffer: ArrayBuffer | undefined

  const fileStream = await minioClient.getObject(bucket, encodeURIComponent(fileURL)).catch(async (e) => {
    if (e.code === 'NoSuchKey') {
      res.setHeader("X-Cache", "MISS")
      console.log('File not found, downloading...')
      const response = await fetch(fileURL)
      
      arrayBuffer = await response.arrayBuffer()

      // Just create a bloody stream
      return await sharp(arrayBuffer).resize(parseInt(req.params.size), parseInt(req.params.size)).webp().toBuffer()
    }
  })

  if (!fileStream || typeof fileStream === "undefined") {
    res.json({
      error: 'File not found',
    })
  }

  res.setHeader('Content-Type', 'image/webp')
  res.setHeader('Cache-Control', 'public, max-age=604800')

  // Check if it's a buffer or a stream
  if (Buffer.isBuffer(fileStream)) {
    res.send(fileStream)
  } else if(fileStream) {
    fileStream.pipe(res)
  }

  if (arrayBuffer) {
    resizeAndUpload(arrayBuffer, fileURL)
  }
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
