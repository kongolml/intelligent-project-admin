import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { PortfolioItems } from './collections/PortfolioItems'
import { PortfolioCategories } from './collections/PortfolioCategories'
import { MediaFiles } from './collections/MediaFiles'
import { Teammates } from './collections/Teammates'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, PortfolioItems, PortfolioCategories, MediaFiles, Teammates],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
  }),
  localization: {
    locales: [
      { label: 'English', code: 'en' },
      { label: 'Ukrainian', code: 'uk' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  sharp,
  plugins: [],
})
