import type { CollectionConfig } from 'payload'
import { notifyFrontend } from '../lib/notifyFrontend'

export const Teammates: CollectionConfig = {
  slug: 'teammates',
  dbName: 'teammates',
  admin: {
    useAsTitle: 'name',
  },
  hooks: {
    afterChange: [
      ({ doc, collection, operation }) => {
        void notifyFrontend(collection.slug, operation, doc as Record<string, unknown>)
      },
    ],
    afterDelete: [
      ({ doc, collection }) => {
        void notifyFrontend(collection.slug, 'delete', doc as Record<string, unknown>)
      },
    ],
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
