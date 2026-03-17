import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { generateDateBasedPath, uploadToS3 } from '@/lib/s3-upload'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const s3Key = generateDateBasedPath(file.name, 'thumbnails')
    const { s3Key: uploadedKey, bucket } = await uploadToS3(buffer, s3Key, file.type)

    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: 'media-files',
      data: {
        s3Key: uploadedKey,
        bucket,
        mime: file.type,
        name: file.name.replace(/\.[^/.]+$/, ''),
        originalName: file.name,
        size: file.size,
      },
    })

    return NextResponse.json(doc)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
