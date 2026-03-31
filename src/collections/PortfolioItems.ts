import type { CollectionConfig } from 'payload'
import { lexicalHTMLField } from '@payloadcms/richtext-lexical'
import { notifyFrontend } from '../lib/notifyFrontend'

export const PortfolioItems: CollectionConfig = {
  slug: 'portfolio-items',
  dbName: 'portfolio_items',
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
      type: 'richText',
    },
    lexicalHTMLField({ lexicalFieldName: 'description', htmlFieldName: 'descriptionHTML' }),
    {
      name: 'client_goal',
      label: 'Client Goal',
      type: 'richText',
      localized: true,
    },
    lexicalHTMLField({ lexicalFieldName: 'client_goal', htmlFieldName: 'client_goalHTML' }),
    {
      name: 'our_task',
      type: 'richText',
      label: 'Our Task',
      localized: true,
    },
    lexicalHTMLField({ lexicalFieldName: 'our_task', htmlFieldName: 'our_taskHTML' }),
    {
      name: 'concept',
      type: 'richText',
      label: 'Concept',
      localized: true,
    },
    lexicalHTMLField({ lexicalFieldName: 'concept', htmlFieldName: 'conceptHTML' }),
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'portfolio-categories',
      hasMany: true,
    },
    {
      name: 'main_image',
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
      name: 'visual_inspiration',
      type: 'relationship',
      relationTo: 'media-files',
      label: 'Visual Inspiration',
      hasMany: true,
      admin: {
        components: {
          Field: '@/components/ImageGalleryField#ImageGalleryField',
        },
      },
    },
    {
      name: 'visual_exploration',
      type: 'relationship',
      relationTo: 'media-files',
      label: 'Visual Exploration',
      hasMany: true,
      admin: {
        components: {
          Field: '@/components/ImageGalleryField#ImageGalleryField',
        },
      },
    },
    {
      name: 'final_result_gallery',
      type: 'relationship',
      relationTo: 'media-files',
      label: 'Final Result Gallery',
      hasMany: true,
      admin: {
        components: {
          Field: '@/components/ImageGalleryField#ImageGalleryField',
        },
      },
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
