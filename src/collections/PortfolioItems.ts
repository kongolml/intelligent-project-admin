import type { CollectionConfig } from 'payload'
import { lexicalHTMLField } from '@payloadcms/richtext-lexical'

export const PortfolioItems: CollectionConfig = {
  slug: 'portfolio-items',
  dbName: 'portfolio_items',
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
    },
    {
      name: 'client',
      type: 'text',
      localized: true,
    },
    {
      name: 'year',
      type: 'number',
    },
    {
      name: 'description',
      type: 'richText'
    },
    lexicalHTMLField({ lexicalFieldName: 'description', htmlFieldName: 'descriptionHTML' }),
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'portfolio-categories',
      hasMany: true,
    },
    {
      name: 'thumbnail',
      type: 'relationship',
      relationTo: 'media-files',
      admin: {
        components: {
          Field: '@/components/ThumbnailField#ThumbnailField',
        },
      },
    },
    {
      name: 'mediaFiles',
      type: 'relationship',
      relationTo: 'media-files',
      hasMany: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      validate: (value: string | null | undefined) => {
        if (!value) return true
        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
          ? true
          : 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. my-project-2024)'
      },
      admin: {
        description: 'URL-safe identifier: lowercase letters, numbers, and hyphens only',
      },
    },
    {
      name: 'isShowcase',
      type: 'checkbox',
    },
  ],
}
