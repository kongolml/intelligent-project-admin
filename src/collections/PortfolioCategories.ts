import type { CollectionConfig } from 'payload'
import { notifyFrontend } from '../lib/notifyFrontend'

export const PortfolioCategories: CollectionConfig = {
  slug: 'portfolio-categories',
  dbName: 'portfolio_categories',
  timestamps: false,
  access: {
    read: () => true,
  },
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
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'description',
      type: 'text',
      required: true,
    },
  ],
}
