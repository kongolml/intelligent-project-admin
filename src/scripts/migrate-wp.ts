import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SQL_PATH = path.resolve(ROOT, 'intellig.sql')

// Load .env before importing payload config (which reads env vars at import time)
const envFile = fs.readFileSync(path.resolve(ROOT, '.env'), 'utf-8')
for (const line of envFile.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  } else {
    // Strip inline comments (unquoted values only)
    const commentIdx = val.indexOf(' #')
    if (commentIdx >= 0) val = val.slice(0, commentIdx).trim()
  }
  process.env[key] = val
}

const { getPayload } = await import('payload')
const { default: config } = await import('../payload.config.js')
const { uploadToS3, generateDateBasedPath } = await import('../lib/s3-upload.js')

// ─── SQL Parser ──────────────────────────────────────────────────────────────

function parseSqlValues(valuesStr: string): string[][] {
  const rows: string[][] = []
  let i = 0

  while (i < valuesStr.length) {
    // find next '('
    while (i < valuesStr.length && valuesStr[i] !== '(') i++
    if (i >= valuesStr.length) break
    i++ // skip '('

    const row: string[] = []
    while (i < valuesStr.length && valuesStr[i] !== ')') {
      // skip whitespace
      while (i < valuesStr.length && valuesStr[i] === ' ') i++

      if (valuesStr[i] === "'") {
        // quoted string
        i++ // skip opening quote
        let val = ''
        while (i < valuesStr.length) {
          if (valuesStr[i] === '\\') {
            // escaped character
            i++
            if (i < valuesStr.length) {
              if (valuesStr[i] === 'n') val += '\n'
              else if (valuesStr[i] === 'r') val += '\r'
              else if (valuesStr[i] === 't') val += '\t'
              else val += valuesStr[i]
            }
            i++
          } else if (valuesStr[i] === "'" && valuesStr[i + 1] === "'") {
            val += "'"
            i += 2
          } else if (valuesStr[i] === "'") {
            i++ // skip closing quote
            break
          } else {
            val += valuesStr[i]
            i++
          }
        }
        row.push(val)
      } else if (valuesStr.substring(i, i + 4) === 'NULL') {
        row.push('NULL')
        i += 4
      } else {
        // unquoted value (number)
        let val = ''
        while (i < valuesStr.length && valuesStr[i] !== ',' && valuesStr[i] !== ')') {
          val += valuesStr[i]
          i++
        }
        row.push(val.trim())
      }

      // skip comma
      if (i < valuesStr.length && valuesStr[i] === ',') i++
    }

    if (i < valuesStr.length) i++ // skip ')'
    rows.push(row)

    // skip comma between rows
    if (i < valuesStr.length && valuesStr[i] === ',') i++
  }

  return rows
}

function extractTable(sql: string, tableName: string, columns: string[]): Record<string, string>[] {
  // Find all INSERT INTO statements for this table
  const pattern = new RegExp(
    `INSERT INTO \`${tableName}\`[^V]*VALUES\\s*\\n?`,
    'g'
  )

  const results: Record<string, string>[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(sql)) !== null) {
    // Find the VALUES block - everything from match end to the next ';'
    const start = match.index + match[0].length
    const endIdx = sql.indexOf(';\n', start)
    const valuesStr = endIdx > 0 ? sql.substring(start, endIdx) : sql.substring(start)

    const rows = parseSqlValues(valuesStr)
    for (const row of rows) {
      const obj: Record<string, string> = {}
      for (let c = 0; c < columns.length && c < row.length; c++) {
        obj[columns[c]] = row[c]
      }
      results.push(obj)
    }
  }

  return results
}

// ─── HTML → Lexical ─────────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&#8230;/g, '\u2026')
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<[^>]*>/g, '')
  ).trim()
}

function textToLexical(text: string): object | undefined {
  if (!text || !text.trim()) return undefined

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  if (paragraphs.length === 0) return undefined

  return {
    root: {
      type: 'root',
      children: paragraphs.map(p => ({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'text',
            version: 1,
            text: p.replace(/\n/g, ' ').trim(),
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
        textFormat: 0,
        textStyle: '',
      })),
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

// ─── Category Mapping ────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, { name: string; slug: string; description: string }> = {
  '8': { name: 'Branding', slug: 'identity', description: 'Full-cycle brand creation: logos, corporate identity, brand guidelines' },
  '5': { name: 'Packaging', slug: 'packaging-design', description: 'Comprehensive packaging design solutions' },
  '4': { name: 'Web', slug: 'web', description: 'Full website development: UX/UI, animations, responsive design' },
  '3': { name: 'Polygraphy', slug: 'polygraphic-design', description: 'Graphic design for print production' },
  '7': { name: 'Illustration', slug: 'image-processing', description: 'Original illustrations and image processing' },
}

// ─── Main Migration ──────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    return { buffer, contentType }
  } catch {
    return null
  }
}

function parsePhpSerializedIntArray(val: string): string[] {
  // PHP serialized format: a:2:{i:0;i:680;i:1;i:681;}
  if (val.startsWith('a:')) {
    return [...val.matchAll(/i:\d+;i:(\d+);/g)].map(m => m[1])
  }
  // Plain comma-separated IDs: "680,681"
  return val.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s))
}

async function migrate() {
  console.log('Reading SQL dump...')
  const sql = fs.readFileSync(SQL_PATH, 'utf-8')

  // ── Extract tables ──

  console.log('Parsing wp_posts...')
  const wpPosts = extractTable(sql, 'wp_posts', [
    'ID', 'post_author', 'post_date', 'post_date_gmt', 'post_content',
    'post_title', 'post_excerpt', 'post_status', 'comment_status',
    'ping_status', 'post_password', 'post_name', 'to_ping', 'pinged',
    'post_modified', 'post_modified_gmt', 'post_content_filtered',
    'post_parent', 'guid', 'menu_order', 'post_type', 'post_mime_type',
    'comment_count',
  ])
  console.log(`  Found ${wpPosts.length} total posts`)

  // Index ALL posts by ID (need attachments for image URLs)
  const allPostsById = new Map<string, Record<string, string>>()
  for (const post of wpPosts) {
    allPostsById.set(post.ID, post)
  }

  const portfolioPosts = wpPosts.filter(p => p.post_type === 'intproj-portfolio')
  console.log(`  Found ${portfolioPosts.length} portfolio posts`)

  console.log('Parsing wp_postmeta...')
  const wpPostmeta = extractTable(sql, 'wp_postmeta', [
    'meta_id', 'post_id', 'meta_key', 'meta_value',
  ])
  console.log(`  Found ${wpPostmeta.length} meta entries`)

  // Build meta lookup: post_id → { meta_key → meta_value }
  const metaByPost = new Map<string, Map<string, string>>()
  for (const m of wpPostmeta) {
    if (!metaByPost.has(m.post_id)) metaByPost.set(m.post_id, new Map())
    metaByPost.get(m.post_id)!.set(m.meta_key, m.meta_value)
  }

  console.log('Parsing wp_icl_translations...')
  const wpTranslations = extractTable(sql, 'wp_icl_translations', [
    'translation_id', 'element_type', 'element_id', 'trid',
    'language_code', 'source_language_code',
  ])
  console.log(`  Found ${wpTranslations.length} translations`)

  const portfolioTranslations = wpTranslations.filter(
    t => t.element_type === 'post_intproj-portfolio'
  )

  // Group by trid: { trid → { ru?: postId, en?: postId, uk?: postId } }
  const tridGroups = new Map<string, Record<string, string>>()
  for (const t of portfolioTranslations) {
    if (!tridGroups.has(t.trid)) tridGroups.set(t.trid, {})
    tridGroups.get(t.trid)![t.language_code] = t.element_id
  }

  // Keep groups where the ru post exists AND is published
  const ruGroups = [...tridGroups.entries()].filter(([, langs]) => {
    if (!langs.ru) return false
    const ruPost = allPostsById.get(langs.ru)
    return ruPost?.post_status === 'publish'
  })
  console.log(`  Found ${ruGroups.length} items with published Russian translations`)

  console.log('Parsing wp_term_relationships...')
  const wpTermRels = extractTable(sql, 'wp_term_relationships', [
    'object_id', 'term_taxonomy_id', 'term_order',
  ])

  // Build post_id → term_taxonomy_ids
  const termsByPost = new Map<string, string[]>()
  for (const r of wpTermRels) {
    if (!termsByPost.has(r.object_id)) termsByPost.set(r.object_id, [])
    termsByPost.get(r.object_id)!.push(r.term_taxonomy_id)
  }

  // ── Initialize Payload ──

  console.log('Initializing Payload...')
  const payload = await getPayload({ config })

  // ── Create categories ──

  console.log('Creating categories...')
  const wpTermToPayloadId = new Map<string, string>()

  for (const [wpTermId, catData] of Object.entries(CATEGORY_MAP)) {
    const existing = await payload.find({
      collection: 'portfolio-categories',
      where: { slug: { equals: catData.slug } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      console.log(`  Category "${catData.name}" already exists, skipping`)
      wpTermToPayloadId.set(wpTermId, String(existing.docs[0].id))
      continue
    }

    const doc = await payload.create({
      collection: 'portfolio-categories',
      data: catData,
    })
    console.log(`  Created category: ${catData.name}`)
    wpTermToPayloadId.set(wpTermId, String(doc.id))
  }

  // ── Create portfolio items ──

  console.log('\nMigrating portfolio items...')
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let imagesUploaded = 0

  for (const [trid, langs] of ruGroups) {
    const ruPostId = langs.ru!
    const ukPostId = langs.uk
    const enPostId = langs.en

    const ruPost = allPostsById.get(ruPostId)
    if (!ruPost) {
      console.log(`  [SKIP] trid=${trid}: Russian post ID ${ruPostId} not found in wp_posts`)
      skipped++
      continue
    }

    // Slug: prefer English post_name, fall back to Russian, then Ukrainian
    let slug = ''
    if (enPostId) {
      const enPost = allPostsById.get(enPostId)
      if (enPost?.post_name) slug = enPost.post_name
    }
    if (!slug && ruPost.post_name) {
      slug = ruPost.post_name
    }
    if (!slug && ukPostId) {
      const ukPost = allPostsById.get(ukPostId)
      if (ukPost?.post_name) slug = ukPost.post_name
    }

    // Sanitize slug to match validation: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    slug = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (!slug) {
      console.log(`  [SKIP] trid=${trid}: No slug available`)
      skipped++
      continue
    }

    // Check if already exists — if so, update it (add missing description/image)
    const existing = await payload.find({
      collection: 'portfolio-items',
      where: { slug: { equals: slug } },
      limit: 1,
    })

    // Description: try ru post_content first, then en, then uk
    let descriptionText = ''
    for (const postId of [ruPostId, enPostId, ukPostId]) {
      if (!postId) continue
      const post = allPostsById.get(postId)
      if (post?.post_content && post.post_content !== 'NULL') {
        const stripped = stripHtml(post.post_content)
        if (stripped) {
          descriptionText = stripped
          break
        }
      }
    }
    const description = textToLexical(descriptionText)

    // Categories - use the ru post's term relationships
    const sourcePostId = ruPostId
    const termIds = termsByPost.get(sourcePostId) || []
    const categoryIds = termIds
      .map(tid => wpTermToPayloadId.get(tid))
      .filter((id): id is string => !!id)

    // isShowcase from source post's meta
    const sourceMeta = metaByPost.get(sourcePostId)
    const isShowcase = sourceMeta?.get('is_featured') === '1'

    // Subtitle from short_description postmeta
    const shortDesc = sourceMeta?.get('short_description')
    const subtitle = shortDesc && shortDesc !== 'NULL' ? shortDesc.trim() : undefined

    // Thumbnail image: get _thumbnail_id from the source post's meta
    let mainImageId: string | undefined
    const thumbnailWpId = sourceMeta?.get('_thumbnail_id')
    if (thumbnailWpId && thumbnailWpId !== 'NULL') {
      const attachmentPost = allPostsById.get(thumbnailWpId)
      if (attachmentPost?.guid) {
        // guid contains the full URL like http://intelligent-project.com/wp-content/uploads/...
        let imageUrl = attachmentPost.guid
        // Normalize localhost URLs to production domain
        imageUrl = imageUrl.replace('http://localhost:8888/intproj', 'http://intelligent-project.com')

        try {
          const imageData = await downloadImage(imageUrl)
          if (imageData) {
            const filename = path.basename(new URL(imageUrl).pathname)
            const s3Key = generateDateBasedPath(filename, 'thumbnails')
            const { s3Key: uploadedKey, bucket } = await uploadToS3(imageData.buffer, s3Key, imageData.contentType)

            const mediaDoc = await payload.create({
              collection: 'media-files',
              data: {
                s3Key: uploadedKey,
                bucket,
                mime: imageData.contentType,
                name: attachmentPost.post_title || filename,
                originalName: filename,
                size: imageData.buffer.length,
              },
            })
            mainImageId = String(mediaDoc.id)
            imagesUploaded++
          } else {
            console.log(`    [WARN] Could not download image: ${imageUrl}`)
          }
        } catch (imgErr) {
          console.log(`    [WARN] Image upload failed: ${imgErr instanceof Error ? imgErr.message : imgErr}`)
        }
      }
    }

    // Gallery images from images_gallery postmeta (PHP serialized array of attachment IDs)
    const galleryIds: string[] = []
    const imagesGalleryRaw = sourceMeta?.get('images_gallery')
    if (imagesGalleryRaw && imagesGalleryRaw !== 'NULL') {
      const attachmentIds = parsePhpSerializedIntArray(imagesGalleryRaw)
      for (const attId of attachmentIds) {
        const attachmentPost = allPostsById.get(attId)
        if (!attachmentPost?.guid) continue

        let imageUrl = attachmentPost.guid
        imageUrl = imageUrl.replace('http://localhost:8888/intproj', 'http://intelligent-project.com')

        try {
          const imageData = await downloadImage(imageUrl)
          if (imageData) {
            const filename = path.basename(new URL(imageUrl).pathname)
            const s3Key = generateDateBasedPath(filename, 'gallery')
            const { s3Key: uploadedKey, bucket } = await uploadToS3(imageData.buffer, s3Key, imageData.contentType)

            const mediaDoc = await payload.create({
              collection: 'media-files',
              data: {
                s3Key: uploadedKey,
                bucket,
                mime: imageData.contentType,
                name: attachmentPost.post_title || filename,
                originalName: filename,
                size: imageData.buffer.length,
              },
            })
            galleryIds.push(String(mediaDoc.id))
            imagesUploaded++
          } else {
            console.log(`    [WARN] Could not download gallery image: ${imageUrl}`)
          }
        } catch (imgErr) {
          console.log(`    [WARN] Gallery image upload failed: ${imgErr instanceof Error ? imgErr.message : imgErr}`)
        }
      }
    }

    try {
      if (existing.docs.length > 0) {
        // Update existing item with missing data
        const existingDoc = existing.docs[0]
        const updateData: Record<string, any> = {}

        if (description && !existingDoc.description) {
          updateData.description = description
        }
        if (mainImageId && !existingDoc.main_image) {
          updateData.main_image = mainImageId
        }
        if (galleryIds.length > 0 && (!existingDoc.final_result_gallery || (existingDoc.final_result_gallery as any[]).length === 0)) {
          updateData.final_result_gallery = galleryIds
        }

        // Update Russian name (primary)
        await payload.update({
          collection: 'portfolio-items',
          id: existingDoc.id,
          locale: 'ru',
          data: {
            name: ruPost.post_title,
            ...(subtitle ? { subtitle } : {}),
            ...updateData,
          },
        })

        // Bind all associated media files back to this portfolio item
        const allMediaIds = [
          ...(mainImageId ? [mainImageId] : []),
          ...galleryIds,
        ]
        for (const mediaId of allMediaIds) {
          const mediaDoc = await payload.findByID({ collection: 'media-files', id: mediaId })
          const existingRels = Array.isArray(mediaDoc.portfolioItems)
            ? (mediaDoc.portfolioItems as any[]).map((r: any) => typeof r === 'string' ? r : r.id)
            : []
          if (!existingRels.includes(String(existingDoc.id))) {
            await payload.update({
              collection: 'media-files',
              id: mediaId,
              data: { portfolioItems: [...existingRels, String(existingDoc.id)] },
            })
          }
        }

        updated++
        console.log(`  [UPD] "${ruPost.post_title}" (slug: ${slug})`)
        continue
      }

      // Create with Russian locale (primary)
      const doc = await payload.create({
        collection: 'portfolio-items',
        locale: 'ru',
        data: {
          name: ruPost.post_title,
          slug,
          description: description as any,
          categories: categoryIds,
          isShowcase,
          ...(subtitle ? { subtitle } : {}),
          ...(mainImageId ? { main_image: mainImageId } : {}),
          ...(galleryIds.length > 0 ? { final_result_gallery: galleryIds } : {}),
        },
      })

      // Bind all associated media files back to this portfolio item
      const allMediaIds = [
        ...(mainImageId ? [mainImageId] : []),
        ...galleryIds,
      ]
      for (const mediaId of allMediaIds) {
        await payload.update({
          collection: 'media-files',
          id: mediaId,
          data: { portfolioItems: [String(doc.id)] },
        })
      }

      // Update with Ukrainian locale if available
      if (ukPostId) {
        const ukPost = allPostsById.get(ukPostId)
        if (ukPost) {
          await payload.update({
            collection: 'portfolio-items',
            id: doc.id,
            locale: 'uk',
            data: {
              name: ukPost.post_title,
            },
          })
        }
      }

      // Update with English locale if available
      if (enPostId) {
        const enPost = allPostsById.get(enPostId)
        if (enPost) {
          await payload.update({
            collection: 'portfolio-items',
            id: doc.id,
            locale: 'en',
            data: {
              name: enPost.post_title,
            },
          })
        }
      }

      created++
      console.log(`  [OK] "${ruPost.post_title}" (slug: ${slug})`)
    } catch (err) {
      errors++
      console.error(`  [ERR] "${ruPost.post_title}": ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('\n── Migration Complete ──')
  console.log(`  Created:  ${created}`)
  console.log(`  Updated:  ${updated}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  Errors:   ${errors}`)
  console.log(`  Images:   ${imagesUploaded}`)

  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
