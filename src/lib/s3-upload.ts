import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import path from 'path'

const s3Client = new S3Client({
  region: process.env.DIGITALOCEAN_SPACE_REGION || '',
  endpoint: process.env.DIGITALOCEAN_SPACE_ENDPOINT || '',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: false,
})

export function generateDateBasedPath(filename: string, category = 'portfolio'): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const ext = path.extname(filename)
  const baseName = path
    .basename(filename, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const timestamp = Date.now()
  const cleanFilename = `${timestamp}-${baseName}${ext}`

  return `${category}/${year}/${month}/${day}/${cleanFilename}`
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<{ s3Key: string; bucket: string }> {
  const bucket = process.env.DIGITALOCEAN_SPACE_BUCKET || ''

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    }),
  )

  return { s3Key: key, bucket }
}
