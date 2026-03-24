# WordPress → Payload CMS Migration Map

Source: `intellig.sql` — WordPress 6.x with WPML, ACF, custom post types.

---

## WordPress Data Overview

### Custom Post Types

| WP Post Type | Description | Count |
|---|---|---|
| `intproj-portfolio` | Portfolio/project items | ~308 |
| `intproj-team` | Team members | 3+ |

### Languages (WPML)

| Code | Language | Default |
|---|---|---|
| `ru` | Russian | Yes (source) |
| `uk` | Ukrainian | — |
| `en` | English | — |

WPML translation relationships are stored in `wp_icl_translations`:
- `trid` — shared translation group ID across languages
- `language_code` — language of the post
- `source_language_code` — NULL for original, `ru` for translations

### Migration Scope

Only **published** portfolio items that have a `ru` language entry in `wp_icl_translations` will be migrated. Russian content (`language_code = 'ru'`) maps to the `ru` locale in Payload CMS.

> **Note:** `ru` must be added as a supported locale in `src/payload.config.ts` (alongside existing `en` and `uk`) before running the migration.

---

## Portfolio Items (`intproj-portfolio`)

### wp_posts fields

| WP Field | Description | Maps To (Payload) |
|---|---|---|
| `ID` | Post ID | — (use slug as key) |
| `post_title` | Project name (ru) | `name` (locale: ru) |
| `post_content` | Long description (ru) | `description` richText (locale: ru) |
| `post_name` | URL slug | `slug` |
| `post_status` | `publish` / `draft` | only `publish` items are migrated |
| `menu_order` | Sort order | `order` or ignored |
| `post_date` | Creation date | `createdAt` |

### wp_postmeta fields (ACF)

| Meta Key | ACF Field ID | Type | Description | Maps To (Payload) |
|---|---|---|---|---|
| `_thumbnail_id` | — | int | Featured image attachment ID | `thumbnail` → `MediaFiles` |
| `images_gallery` | `field_6249ce9f98f3c` | array of int | Gallery image attachment IDs | `final_result_gallery` relationship |
| `is_featured` | `field_5af739f54c4af` | bool (0/1) | Showcase flag | `isShowcase` |
| `the_main_task` | `field_5abce7af0504f` | text | Main task description | part of `description` |
| `pop_up_text` | `field_5abce8b878fa8` | html string | Short popup description | — (skip) |
| `block_full_1..3` | `field_5abd4d62...` | — | Full-width content blocks | TBD / part of description |
| `block_half_1..2` | `field_5abd5ba0...` | — | Half-width content blocks | TBD / part of description |
| `short_description` | — | text | Brief summary | `subtitle` |

### Taxonomies

| Taxonomy | Term Slug | Term Name (en) | Payload Category Slug |
|---|---|---|---|
| `category` | `identity` | Branding | `branding` |
| `category` | `rackaging-design` | Packaging | `packaging` |
| `category` | `web` | Web | `web` |
| `category` | `polygraphic-design` | Polygraphic Design | `polygraphic-design` |
| `category` | `image-processing` | Illustrations | `illustrations` |

> Note: `translation_priority` is a WPML internal taxonomy — skip.

---

## Media Attachments

WordPress stores files as `post_type='attachment'` entries. Each has:
- `ID` — attachment post ID (referenced by `_thumbnail_id`, `images_gallery`)
- `guid` — original upload URL
- `post_title` — file name
- `_wp_attachment_metadata` — serialized PHP array with `file`, `width`, `height`, `sizes`

### Migration strategy for media

1. Extract file path from `_wp_attachment_metadata` → `file` key
2. Download original file from WP media library (or copy from backup)
3. Upload to DigitalOcean Spaces via `POST /api/upload`
4. Map old attachment ID → new `MediaFiles` document ID
5. Use the ID map to set `thumbnail` and `final_result_gallery` on each portfolio item

---

## Team Members (`intproj-team`)

### wp_postmeta fields

| Meta Key | Description | Maps To (Payload `Teammates`) |
|---|---|---|
| `team_member_0_name` | Full name | `name` |
| `team_member_0_position` | Job title | `title` |
| `team_member_0_photo` | Attachment ID (photo) | `image` → `MediaFiles` |

### Sample data

| WP ID | Name | Position | Status |
|---|---|---|---|
| 484 | Alexey Kvasov | Founder & Art Director | publish |
| 486 | Konstantin Golosov | Founder & Creative Director | publish |

---

## WPML Translation Lookup

To get all language versions of a portfolio item:

```sql
-- Get all translations of a post by its trid
SELECT p.ID, p.post_title, t.language_code, t.source_language_code
FROM wp_posts p
JOIN wp_icl_translations t ON t.element_id = p.ID
WHERE t.element_type = 'post_intproj-portfolio'
  AND t.trid = (
    SELECT trid FROM wp_icl_translations
    WHERE element_id = <source_post_id>
      AND element_type = 'post_intproj-portfolio'
  );
```

Each `trid` group should yield 1–3 rows (ru, uk, en). The Russian post is the original; uk/en are translations.

---

## Migration Script Outline

```
1. Fetch all intproj-portfolio posts where post_status = 'publish' AND have a ru entry in wp_icl_translations
2. For each post, fetch its WPML trid from wp_icl_translations
3. For each migrated ru item, fetch uk/en variants by trid only if they exist — never migrate uk/en translations that don't have a corresponding published ru item
4. For each post, fetch postmeta: _thumbnail_id, images_gallery, is_featured, short_description
5. Fetch category term IDs from wp_term_relationships → wp_term_taxonomy → wp_terms
6. Build media ID map: download/upload attachments → collect Payload MediaFiles IDs
7. Map WP categories → Payload PortfolioCategories IDs
8. POST to Payload REST API: /api/portfolio-items with locale=ru for Russian content
9. PATCH /api/portfolio-items/:id?locale=uk and ?locale=en for additional translations if present
```

---

## Key Stats

| Item | Count |
|---|---|
| Portfolio posts total | ~308 |
| Published portfolio posts | ~200 (est.) |
| Categories | 5 (usable) |
| Team members | 2 |
| Languages | 3 (ru, uk, en) |
| Media attachments | 1000+ |
