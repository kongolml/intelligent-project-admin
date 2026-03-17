import type { CollectionConfig } from 'payload'

export const Teammates: CollectionConfig = {
  slug: 'teammates',
  dbName: 'teammates',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'image',
      type: 'relationship',
      relationTo: 'media-files',
      hasMany: true,
    },
  ],
}
