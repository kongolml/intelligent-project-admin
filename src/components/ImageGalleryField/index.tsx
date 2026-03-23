'use client'

import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useField } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

type MediaDoc = {
  id: string
  url?: string
  name?: string
}

type Props = {
  path: string
  label?: string
}

function extractId(item: unknown): string | null {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    return (o.id ?? o.value ?? null) as string | null
  }
  return null
}

function deriveLabel(path: string): string {
  return path
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// --- SortableItem ---

type SortableItemProps = {
  id: string
  url?: string
  onRemove: () => void
}

const SortableItem: React.FC<SortableItemProps> = ({ id, url, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        width: '160px',
        height: '120px',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        flexShrink: 0,
      }}
      {...attributes}
      {...listeners}
    >
      {url ? (
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            color: 'var(--theme-elevation-400)',
          }}
        >
          Loading…
        </div>
      )}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          fontSize: '14px',
          lineHeight: '22px',
          textAlign: 'center',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Remove image"
      >
        ×
      </button>
    </div>
  )
}

// --- ImageGalleryField ---

export const ImageGalleryField: React.FC<Props> = ({ path, label }) => {
  const { value, setValue } = useField<unknown[]>({ path })
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewCache = useRef<Record<string, string>>({})

  const ids: string[] = Array.isArray(value)
    ? (value.map(extractId).filter(Boolean) as string[])
    : []

  // Fetch previews for IDs not yet cached
  useEffect(() => {
    const missing = ids.filter((id) => !previewCache.current[id])
    if (missing.length === 0) return

    Promise.all(
      missing.map((id) =>
        fetch(`/api/media-files/${id}`)
          .then((r) => r.json())
          .then((doc: MediaDoc) => ({ id, url: doc?.url ?? '' }))
          .catch(() => ({ id, url: '' })),
      ),
    ).then((results) => {
      const next: Record<string, string> = {}
      for (const { id, url } of results) {
        previewCache.current[id] = url
        next[id] = url
      }
      setPreviews((prev) => ({ ...prev, ...next }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    setValue(arrayMove(ids, oldIndex, newIndex))
  }

  const handleRemove = (id: string) => {
    setValue(ids.filter((i) => i !== id))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    setIsUploading(true)
    setError(null)

    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/upload', { method: 'POST', body: fd })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error((body as { error?: string }).error ?? 'Upload failed')
          }
          return res.json() as Promise<MediaDoc>
        }),
      )

      const newIds = results.map((doc) => doc.id)
      // Pre-populate preview cache
      for (const doc of results) {
        if (doc.url) previewCache.current[doc.id] = doc.url
      }
      setPreviews((prev) => {
        const next = { ...prev }
        for (const doc of results) {
          if (doc.url) next[doc.id] = doc.url
        }
        return next
      })
      setValue([...ids, ...newIds])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const displayLabel = label ?? deriveLabel(path)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 0' }}>
      <label
        style={{
          display: 'block',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '2px',
          color: 'var(--theme-elevation-1000)',
        }}
      >
        {displayLabel}
      </label>

      {ids.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {ids.map((id) => (
                <SortableItem
                  key={id}
                  id={id}
                  url={previews[id]}
                  onRemove={() => handleRemove(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          style={{
            padding: '7px 16px',
            fontSize: '13px',
            fontWeight: 500,
            background: 'var(--theme-success-500, #0070f3)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.65 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isUploading ? 'Uploading…' : 'Add Images'}
        </button>

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
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
