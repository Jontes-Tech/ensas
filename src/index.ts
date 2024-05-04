import { Hono } from 'hono'
import * as Minio from 'minio'
import { stream } from "hono/streaming"

const app = new Hono()

const minioClient = new Minio.Client({
  endPoint: '10.88.0.2',
  port: 9000,
  useSSL: false,
  accessKey: 'ereWNoGlQcPUK6ftqCEh',
  secretKey: 'icqXKqTcxtp6hbQHPwJPfGsRnqBvzzYKJVyIOC75',
})

const sizes = [256]

const getAvatarURL = async (name: string) => {
  const response = await fetch("https://enstate.rs/n/" + name)
  const data = await response.json()
  return (data.avatar || "").toString()
}

app.get('/i/:image/:size', async (c) => {
  if (!sizes.includes(parseInt(c.req.param().size))) {
    return c.json({
      error: 'Invalid size',
    })
  }

  const bucket = 'ens-avatar-' + c.req.param().size

  const fileURL = await getAvatarURL(c.req.param().image)

  console.log(fileURL)

  const fileStream = await minioClient.getObject(bucket, encodeURIComponent(fileURL)).catch(async (e) => {
    if (e.code === 'NoSuchKey') {
      const response = await fetch(fileURL)
      const buffer = Buffer.from(await response.arrayBuffer())
      const size = buffer.length
      await minioClient.putObject(bucket, encodeURIComponent(fileURL), buffer, size, {
        'Content-Type': response.headers.get('Content-Type') || 'image/webp',
      })
      return minioClient.getObject(bucket, encodeURIComponent(fileURL))
    }
  })

  if (!fileStream) {
    return c.json({
      error: 'Failed to fetch image',
    })
  }

  fileStream.on("end", async () => {
    const arrayBuffer = await fileStream.toArray()
    return c.body(fileStream.toArray(), {
      'Content-Type': "image/webp",
    })
  })
})
export default app
