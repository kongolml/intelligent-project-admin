import type { CollectionConfig } from 'payload'

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
