'use client'

import { useField } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

type Props = {
  path: string
}

type MediaDoc = {
  id: string
  url?: string
  name?: string
}

export const ThumbnailField: React.FC<Props> = ({ path }) => {
  const { value, setValue } = useField<string | null>({ path })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Relationship value can be a plain ID string or a populated object
  const mediaId: string | null =
    value && typeof value === 'object'
      ? ((value as unknown as { id?: string; value?: string }).id ??
        (value as unknown as { id?: string; value?: string }).value ??
        null)
      : (value as string | null) ?? null

  useEffect(() => {
    if (!mediaId) {
      setPreviewUrl(null)
      return
    }
    fetch(`/api/media-files/${mediaId}`)
      .then((r) => r.json())
      .then((doc: MediaDoc) => setPreviewUrl(doc?.url ?? null))
      .catch(() => setPreviewUrl(null))
  }, [mediaId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(null)
    setPreviewUrl(null)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Upload failed')
      }

      const doc: MediaDoc = await res.json()
      setValue(doc.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setIsLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = () => {
    setValue(null)
    setPreviewUrl(null)
    setError(null)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px 0',
      }}
    >
      <label
        style={{
          display: 'block',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '2px',
          color: 'var(--theme-elevation-1000)',
        }}
      >
        Thumbnail
      </label>

      {/* Preview area */}
      {mediaId ? (
        <div
          style={{
            position: 'relative',
            width: '240px',
            height: '160px',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--theme-elevation-150)',
            background: 'var(--theme-elevation-50)',
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Thumbnail preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                color: 'var(--theme-elevation-400)',
              }}
            >
              Loading...
            </div>
          )}
        </div>
      ) : null}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
          style={{
            padding: '7px 16px',
            fontSize: '13px',
            fontWeight: 500,
            background: 'var(--theme-success-500, #0070f3)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.65 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isLoading ? 'Uploading…' : mediaId ? 'Replace' : 'Upload Image'}
        </button>

        {mediaId && !isLoading && (
          <button
            type="button"
            onClick={handleRemove}
            style={{
              padding: '7px 16px',
              fontSize: '13px',
              fontWeight: 500,
              background: 'transparent',
              color: 'var(--theme-error-500, #dc2626)',
              border: '1px solid currentColor',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Remove
          </button>
        )}

        {error && (
          <span style={{ fontSize: '13px', color: 'var(--theme-error-500, #dc2626)' }}>
            {error}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
