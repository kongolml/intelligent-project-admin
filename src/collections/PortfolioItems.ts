import type { CollectionConfig } from 'payload'

export const PortfolioItems: CollectionConfig = {
  slug: 'portfolio-items',
  dbName: 'portfolio_items',
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
      type: 'json',
    },
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
    },
    {
      name: 'isShowcase',
      type: 'checkbox',
    },
  ],
}
