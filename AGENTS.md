# AGENTS.md

This file provides guidance for AI coding agents working on this codebase.

---

## BUILD/LINT/TEST COMMANDS

```bash
npm run dev          # Start development server
npm run devsafe      # Clean .next cache and restart dev server
npm run build        # Production build (8GB memory limit)
npm run start        # Start production server
npm run lint         # Run ESLint via next lint
npm run payload      # Run Payload CLI (e.g., payload generate:importmap)
npm run generate:types    # Generate Payload TypeScript types
npm run generate:importmap # Generate import map for Payload

# Standalone scripts
npm run migrate:wp         # Run WordPress migration script
npm run fix:image-connections # Fix broken image connections
```

**Note:** No test suite currently exists in this project.

For single-file linting:
```bash
npx eslint path/to/file.ts
```

---

## CODE STYLE GUIDELINES

### IMPORT CONVENTIONS

- **Path aliases:**
  - `@/*` maps to `./src/*`
  - `@payload-config` maps to `./src/payload.config.ts`
- **Import order:**
  1. External packages (e.g., `react`, `@payloadcms/ui`)
  2. Internal path aliases (e.g., `@/lib/s3-upload`)
  3. Relative imports (e.g., `../lib/notifyFrontend`)
- **Type imports:** Use `import type { Foo } from 'bar'` for TypeScript types to enable tree-shaking

### TYPESCRIPT

- **Strict mode enabled** — no `implicit any`; always type explicitly
- **Function parameters and return types** must be typed for all public APIs
- **Simple objects:** Use inline types
- **Reusable/extended types:** Use `interface`
- **React component Props:** Always define as a named type:

```typescript
type Props = {
  path: string
  label?: string
}
```

### NAMING CONVENTIONS

| Entity | Convention | Example |
|--------|------------|---------|
| Files | kebab-case | `image-gallery-field/index.tsx` |
| React components | PascalCase | `ImageGalleryField` |
| Functions/variables | camelCase | `generateDateBasedPath` |
| Collections | PascalCase export, kebab-case slug | `export const PortfolioItems`, `slug: 'portfolio-items'` |
| Constants (global) | UPPER_SNAKE or camelCase | `MAX_FILE_SIZE` or `defaultTimeout` |
| DB columns | snake_case | `dbName: 'portfolio_items'` |

### REACT COMPONENTS

- Use `'use client'` directive for client-side components
- Prefer functional components with explicit `FC<Props>` typing
- Use `useState`, `useEffect`, `useRef`, `useMemo` as needed
- Avoid unnecessary re-renders — properly manage dependency arrays in hooks
- Extract fragile deps to `useMemo` for clarity

### API ROUTES

- **Runtime:** Set `export const runtime = 'nodejs'` for Node.js runtime
- **Error handling:** Use `try/catch` for all async operations
- **Server-side logging:** Prefix logs with feature name: `console.error('[upload] error:', err)`
- **Client errors:** Return generic messages only: `{ error: 'Upload failed' }`
- **Request/Response:** Use `NextRequest` and `NextResponse` from `next/server`

### PAYLOAD CMS

- Collections defined as `CollectionConfig` objects in `src/collections/`
- Rich text: Use `lexicalEditor()` and `lexicalHTMLField()` helper
- Admin component references use hash notation: `'@/components/ThumbnailField#ThumbnailField'`
- Auto-generated files (e.g., `api/[...slug]/route.ts`) should **not** be modified manually

### S3/DIGITALOCEAN STORAGE

- Use `@aws-sdk/client-s3` `S3Client`
- **Path format:** `category/YYYY/MM/DD/timestamp-filename.ext`
- **Filename sanitization:** Already implemented — lowercase, alphanumeric, hyphens only
- **Category sanitization:** Reject categories not matching `^[a-z0-9-]+$`

### ERROR HANDLING

- Always check `err instanceof Error` before accessing `err.message`
- Never expose internal error details (stack traces, file paths) to clients
- Prefix server-side logs with feature identifier:

```typescript
console.error('[upload] error:', err)
```

### FORMAT/PRETTIER

- **No Prettier config** — ESLint is the sole formatter
- 2-space indentation
- Single quotes for strings
- Trailing commas in multiline statements

---

## DIRECTORY STRUCTURE

```
src/
├── app/                      # Next.js App Router pages and API routes
│   └── (payload)/
│       └── api/              # API endpoints (upload, [...slug])
├── collections/              # Payload collection configs
│   ├── PortfolioItems.ts
│   ├── PortfolioCategories.ts
│   ├── MediaFiles.ts
│   ├── Teammates.ts
│   └── Users.ts
├── components/               # React components (each in own folder)
│   ├── ImageGalleryField/
│   └── ThumbnailField/
├── lib/                      # Utility functions and shared logic
│   ├── s3-upload.ts
│   └── notifyFrontend.ts
├── scripts/                  # Standalone scripts
│   ├── migrate-wp.ts
│   └── fix-image-connections.ts
├── payload.config.ts         # Payload CMS configuration
└── payload-types.ts          # Generated TypeScript types
```
