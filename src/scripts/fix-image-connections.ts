import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SQL_PATH = path.resolve(ROOT, 'intellig.sql')

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
    const commentIdx = val.indexOf(' #')
    if (commentIdx >= 0) val = val.slice(0, commentIdx).trim()
  }
  process.env[key] = val
}

const { getPayload } = await import('payload')
const { default: config } = await import('../payload.config.js')

// ─── SQL Parser (copied from migrate-wp.ts) ───────────────────────────────────

function parseSqlValues(valuesStr: string): string[][] {
  const rows: string[][] = []
  let i = 0

  while (i < valuesStr.length) {
    while (i < valuesStr.length && valuesStr[i] !== '(') i++
    if (i >= valuesStr.length) break
    i++

    const row: string[] = []
    while (i < valuesStr.length && valuesStr[i] !== ')') {
      while (i < valuesStr.length && valuesStr[i] === ' ') i++

      if (valuesStr[i] === "'") {
        i++
        let val = ''
        while (i < valuesStr.length) {
          if (valuesStr[i] === '\\') {
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
            i++
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
        let val = ''
        while (i < valuesStr.length && valuesStr[i] !== ',' && valuesStr[i] !== ')') {
          val += valuesStr[i]
          i++
        }
        row.push(val.trim())
      }

      if (i < valuesStr.length && valuesStr[i] === ',') i++
    }

    if (i < valuesStr.length) i++
    rows.push(row)

    if (i < valuesStr.length && valuesStr[i] === ',') i++
  }

  return rows
}

function extractTable(sql: string, tableName: string, columns: string[]): Record<string, string>[] {
  const pattern = new RegExp(`INSERT INTO \`${tableName}\`[^V]*VALUES\\s*\\n?`, 'g')
  const results: Record<string, string>[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(sql)) !== null) {
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

function parsePhpSerializedIntArray(val: string): string[] {
  return [...val.matchAll(/i:\d+;i:(\d+);/g)].map(m => m[1])
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fixConnections() {
  console.log('Reading SQL dump...')
  const sql = fs.readFileSync(SQL_PATH, 'utf-8')

  const wpPosts = extractTable(sql, 'wp_posts', [
    'ID', 'post_author', 'post_date', 'post_date_gmt', 'post_content',
    'post_title', 'post_excerpt', 'post_status', 'comment_status',
    'ping_status', 'post_password', 'post_name', 'to_ping', 'pinged',
    'post_modified', 'post_modified_gmt', 'post_content_filtered',
    'post_parent', 'guid', 'menu_order', 'post_type', 'post_mime_type',
    'comment_count',
  ])

  const allPostsById = new Map<string, Record<string, string>>()
  for (const post of wpPosts) allPostsById.set(post.ID, post)

  const wpPostmeta = extractTable(sql, 'wp_postmeta', [
    'meta_id', 'post_id', 'meta_key', 'meta_value',
  ])
  const metaByPost = new Map<string, Map<string, string>>()
  for (const m of wpPostmeta) {
    if (!metaByPost.has(m.post_id)) metaByPost.set(m.post_id, new Map())
    metaByPost.get(m.post_id)!.set(m.meta_key, m.meta_value)
  }

  const wpTranslations = extractTable(sql, 'wp_icl_translations', [
    'translation_id', 'element_type', 'element_id', 'trid',
    'language_code', 'source_language_code',
  ])
  const portfolioTranslations = wpTranslations.filter(
    t => t.element_type === 'post_intproj-portfolio'
  )
  const tridGroups = new Map<string, Record<string, string>>()
  for (const t of portfolioTranslations) {
    if (!tridGroups.has(t.trid)) tridGroups.set(t.trid, {})
    tridGroups.get(t.trid)![t.language_code] = t.element_id
  }
  const ruGroups = [...tridGroups.entries()].filter(([, langs]) => {
    if (!langs.ru) return false
    return allPostsById.get(langs.ru)?.post_status === 'publish'
  })

  // Build slug → { thumbnailFilename, galleryFilenames[] } mapping from SQL
  const slugToImages = new Map<string, { thumbnail?: string; gallery: string[] }>()

  for (const [, langs] of ruGroups) {
    const ruPostId = langs.ru!
    const enPostId = langs.en
    const ukPostId = langs.uk

    let slug = ''
    if (enPostId) {
      const enPost = allPostsById.get(enPostId)
      if (enPost?.post_name) slug = enPost.post_name
    }
    if (!slug) slug = allPostsById.get(ruPostId)?.post_name || ''
    if (!slug && ukPostId) slug = allPostsById.get(ukPostId)?.post_name || ''

    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (!slug) continue

    const sourceMeta = metaByPost.get(ruPostId)
    const images: { thumbnail?: string; gallery: string[] } = { gallery: [] }

    // Thumbnail
    const thumbnailWpId = sourceMeta?.get('_thumbnail_id')
    if (thumbnailWpId && thumbnailWpId !== 'NULL') {
      const attachmentPost = allPostsById.get(thumbnailWpId)
      if (attachmentPost?.guid) {
        let imageUrl = attachmentPost.guid.replace('http://localhost:8888/intproj', 'http://intelligent-project.com')
        try {
          images.thumbnail = path.basename(new URL(imageUrl).pathname)
        } catch {}
      }
    }

    // Gallery
    const imagesGalleryRaw = sourceMeta?.get('images_gallery')
    if (imagesGalleryRaw && imagesGalleryRaw !== 'NULL') {
      const attachmentIds = parsePhpSerializedIntArray(imagesGalleryRaw)
      for (const attId of attachmentIds) {
        const attachmentPost = allPostsById.get(attId)
        if (!attachmentPost?.guid) continue
        let imageUrl = attachmentPost.guid.replace('http://localhost:8888/intproj', 'http://intelligent-project.com')
        try {
          images.gallery.push(path.basename(new URL(imageUrl).pathname))
        } catch {}
      }
    }

    slugToImages.set(slug, images)
  }

  console.log(`Built image map for ${slugToImages.size} portfolio items`)

  // Initialize Payload
  console.log('Initializing Payload...')
  const payload = await getPayload({ config })

  // Get all media-files indexed by originalName
  console.log('Loading media-files...')
  const allMediaFiles = await payload.find({
    collection: 'media-files',
    limit: 10000,
    pagination: false,
  })

  // Index by originalName (there might be duplicates — use the latest/first)
  const mediaByOriginalName = new Map<string, string>() // originalName → id
  for (const mf of allMediaFiles.docs) {
    if (mf.originalName && !mediaByOriginalName.has(mf.originalName as string)) {
      mediaByOriginalName.set(mf.originalName as string, String(mf.id))
    }
  }
  console.log(`Indexed ${mediaByOriginalName.size} media-files by originalName`)

  // Get all portfolio items
  const allItems = await payload.find({
    collection: 'portfolio-items',
    limit: 10000,
    pagination: false,
  })
  console.log(`Found ${allItems.docs.length} portfolio items`)

  // Print sample of SQL image map to diagnose
  console.log('\n── SQL image map sample (first 5) ──')
  let sampleCount = 0
  for (const [slug, imgs] of slugToImages) {
    if (sampleCount++ >= 5) break
    console.log(`  slug="${slug}": thumbnail="${imgs.thumbnail ?? 'NONE'}", gallery=[${imgs.gallery.join(', ') || 'EMPTY'}]`)
  }

  // Print sample of media-files originalNames
  console.log('\n── Media-files originalName sample (first 10) ──')
  let mfCount = 0
  for (const [name] of mediaByOriginalName) {
    if (mfCount++ >= 10) break
    console.log(`  "${name}"`)
  }
  console.log('')

  let fixed = 0
  let alreadyLinked = 0
  let noMapping = 0
  let noMediaFile = 0

  for (const item of allItems.docs) {
    const slug = item.slug as string
    const imageMap = slugToImages.get(slug)

    if (!imageMap) {
      noMapping++
      continue // items not from WP migration (manually created)
    }

    const hasMainImage = !!item.main_image
    const hasGallery = Array.isArray(item.final_result_gallery) && (item.final_result_gallery as any[]).length > 0

    // Always log status for matched items
    console.log(`  slug="${slug}": hasMainImage=${hasMainImage}, hasGallery=${hasGallery}, sqlThumb="${imageMap.thumbnail ?? 'NONE'}", sqlGallery=${imageMap.gallery.length}`)

    if (hasMainImage && hasGallery) {
      alreadyLinked++
      continue
    }

    const updateData: Record<string, any> = {}

    if (!hasMainImage && imageMap.thumbnail) {
      const mediaId = mediaByOriginalName.get(imageMap.thumbnail)
      if (mediaId) {
        updateData.main_image = mediaId
      } else {
        console.log(`    [WARN] thumbnail "${imageMap.thumbnail}" not found in media-files`)
        noMediaFile++
      }
    }

    if (!hasGallery && imageMap.gallery.length > 0) {
      const galleryIds = imageMap.gallery
        .map(fname => mediaByOriginalName.get(fname))
        .filter((id): id is string => !!id)

      if (galleryIds.length > 0) {
        updateData.final_result_gallery = galleryIds
      }

      const missing = imageMap.gallery.length - galleryIds.length
      if (missing > 0) {
        console.log(`    [WARN] ${missing}/${imageMap.gallery.length} gallery images not found in media-files`)
      }
    }

    if (Object.keys(updateData).length === 0) {
      continue
    }

    try {
      await payload.update({
        collection: 'portfolio-items',
        id: item.id,
        data: updateData,
      })
      console.log(`  [FIXED] slug="${slug}": connected ${updateData.main_image ? 'main_image' : ''}${updateData.final_result_gallery ? ` gallery(${updateData.final_result_gallery.length})` : ''}`)
      fixed++
    } catch (err) {
      console.error(`  [ERR] slug="${slug}": ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('\n── Fix Complete ──')
  console.log(`  Fixed:           ${fixed}`)
  console.log(`  Already linked:  ${alreadyLinked}`)
  console.log(`  No SQL mapping:  ${noMapping}`)
  console.log(`  Media not found: ${noMediaFile}`)

  process.exit(0)
}

fixConnections().catch(err => {
  console.error('Fix failed:', err)
  process.exit(1)
})
