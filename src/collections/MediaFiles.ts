import type { CollectionConfig } from 'payload'

export const MediaFiles: CollectionConfig = {
  slug: 'media-files',
  dbName: 'media_files',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 's3Key',
      type: 'text',
    },
    {
      name: 'bucket',
      type: 'text',
    },
    {
      name: 'mime',
      type: 'text',
    },
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'originalName',
      type: 'text',
    },
    {
      name: 'size',
      type: 'number',
    },
    {
      name: 'portfolioItems',
      type: 'relationship',
      relationTo: 'portfolio-items',
      hasMany: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [
          ({ data }) => {
            if (data?.bucket && data?.s3Key) {
              return `https://${data.bucket}.${process.env.DIGITALOCEAN_SPACE_HOST}/${data.s3Key}`
            }
            return undefined
          },
        ],
      },
    },
  ],
}
