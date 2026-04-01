# Backend Architecture

## Overview

Payload CMS 3.x running on Next.js 15 with App Router. Uses MongoDB (via Mongoose) for data storage and DigitalOcean Spaces (S3-compatible) for media files. Serves both the admin UI and the REST API that the frontend consumes.

## Tech Stack

- **CMS:** Payload CMS 3.x
- **Framework:** Next.js 15 (App Router)
- **Database:** MongoDB via `@payloadcms/db-mongodb` (Mongoose)
- **Rich Text:** Lexical editor (`@payloadcms/richtext-lexical`)
- **Media Storage:** DigitalOcean Spaces via AWS SDK (`@aws-sdk/client-s3`)
- **Image Processing:** Sharp
- **Module System:** ESM (`"type": "module"`)

## Route Groups

- `src/app/(payload)/` — Payload admin UI and REST API routes. **Auto-generated — do not modify.**
- `src/app/(frontend)/` — Minimal public-facing frontend (redirects to admin)

## Collections

All collections are defined in `src/collections/` as Payload `CollectionConfig` objects.

### PortfolioItems (`portfolio-items`)

Main content collection.

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Required, localized |
| `subtitle` | text | Localized |
| `client` | text | Localized |
| `year` | number | |
| `description` | richText (Lexical) | |
| `descriptionHTML` | text | Auto-derived from `description` via `lexicalHTMLField` |
| `client_goal` | richText | Localized |
| `client_goalHTML` | text | Auto-derived |
| `our_task` | richText | Localized |
| `our_taskHTML` | text | Auto-derived |
| `concept` | richText | Localized |
| `conceptHTML` | text | Auto-derived |
| `categories` | relationship → `portfolio-categories` | hasMany |
| `main_image` | relationship → `media-files` | Single, custom thumbnail field component |
| `mediaFiles` | relationship → `media-files` | hasMany |
| `visual_inspiration` | relationship → `media-files` | hasMany, gallery field component |
| `visual_exploration` | relationship → `media-files` | hasMany, gallery field component |
| `final_result_gallery` | relationship → `media-files` | hasMany, gallery field component |
| `slug` | text | Required, unique, validated (lowercase + hyphens) |
| `isShowcase` | checkbox | Flags items for homepage display |

- Public read access (`read: () => true`)
- `afterChange` and `afterDelete` hooks notify the frontend via webhook

### PortfolioCategories (`portfolio-categories`)

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Required |
| `slug` | text | Required, unique |
| `description` | text | Required |

- No timestamps
- Public read access
- Webhook hooks on change/delete

### MediaFiles (`media-files`)

S3-backed media records. **Not a Payload Upload collection** — files are managed via custom S3 logic.

| Field | Type | Notes |
|-------|------|-------|
| `s3Key` | text | S3 object key |
| `bucket` | text | S3 bucket name |
| `mime` | text | MIME type |
| `name` | text | Display name |
| `originalName` | text | Original filename |
| `size` | number | File size in bytes |
| `portfolioItems` | relationship → `portfolio-items` | Reverse relationship |
| `metadata` | json | Arbitrary metadata |
| `url` | text | Computed via `afterRead` hook: `https://{bucket}.{SPACE_HOST}/{s3Key}` |

- Public read access

### Teammates (`teammates`)

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Required |
| `title` | text | Required (job title) |
| `image` | relationship → `media-files` | hasMany |

- Webhook hooks on change/delete

### Users (`users`)

- Email-based authentication (`auth: true`)
- Used for Payload admin login
- No custom fields

## Media Upload Flow

```
Client uploads file via POST /api/upload (multipart/form-data)
  → src/app/(payload)/api/upload/route.ts
  → src/lib/s3-upload.ts uploads to DigitalOcean Spaces
  → Creates a media-files document in MongoDB
  → Returns document with computed URL
```

Files are organized by date: `{category}/{year}/{month}/{day}/{timestamp}-{sanitized-name}.{ext}`

## Webhook System

When content changes in any collection (except Users and MediaFiles), the `notifyFrontend` hook (`src/lib/notifyFrontend.ts`) sends a POST request to the frontend:

```
POST {FRONTEND_URL}/api/webhook
Headers: x-webhook-secret: {PAYLOAD_WEBHOOK_SECRET}
Body: { collection, event, doc }
```

This triggers on-demand cache revalidation on the frontend.

## Custom Admin Components

- **ThumbnailField** (`src/components/ThumbnailField/`) — replaces default relationship picker for `main_image`. Uploads directly via `/api/upload`, shows image preview.
- **ImageGalleryField** (`src/components/ImageGalleryField/`) — gallery picker for visual_inspiration, visual_exploration, and final_result_gallery fields.

## Localization

Three locales with fallback enabled:

| Code | Language |
|------|----------|
| `en` | English (default) |
| `uk` | Ukrainian |
| `ru` | Russian |

Localized fields: `name`, `subtitle`, `client`, `client_goal`, `our_task`, `concept` (all in PortfolioItems).

## REST API

Payload auto-generates REST endpoints for all collections:

| Endpoint | Description |
|----------|-------------|
| `GET /api/portfolio-items` | List portfolio items (supports `where`, `depth`, `limit`, `locale`) |
| `GET /api/portfolio-items/:id` | Single item by ID |
| `GET /api/portfolio-categories` | List categories |
| `GET /api/teammates` | List team members |
| `GET /api/media-files` | List media files |
| `GET /api/media-files/:id` | Single media file |
| `POST /api/upload` | Custom upload endpoint (multipart/form-data) |

Query parameter `depth=1` populates relationships one level deep (e.g., resolves media-file IDs to full documents with URLs).

## Migration Scripts

- `npm run migrate:wp` — imports data from WordPress (`src/scripts/migrate-wp.ts`)
- `npm run fix:image-connections` — repairs media relationships after migration (`src/scripts/fix-image-connections.ts`)

## Key Configuration (`src/payload.config.ts`)

- Database: MongoDB via `DATABASE_URL`
- Editor: Lexical
- Sharp enabled for image processing
- Collections: Users, PortfolioItems, PortfolioCategories, MediaFiles, Teammates
- `payload-types.ts` auto-generated (in `.gitignore`)
