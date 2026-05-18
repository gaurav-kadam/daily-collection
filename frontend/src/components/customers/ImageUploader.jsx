import { useEffect, useMemo, useState } from 'react'
import { FiImage, FiTrash2, FiUpload } from 'react-icons/fi'

function ImageUploader({
  label = 'Photo',
  emptyLabel = 'Upload photo',
  replaceLabel = 'Replace photo',
  alt = 'Customer image',
  value,
  file,
  onChange,
  onRemove,
  error,
  progress = null,
  disabled = false,
}) {
  const [preview, setPreview] = useState(value || '')

  useEffect(() => {
    if (!file) {
      setPreview(value || '')
      return undefined
    }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file, value])

  const buttonLabel = useMemo(
    () => file?.name || (preview ? replaceLabel : emptyLabel),
    [emptyLabel, file, preview, replaceLabel],
  )
  const progressValue = typeof progress === 'number' ? Math.min(Math.max(progress, 0), 100) : null

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {preview ? (
            <img src={preview} alt={alt} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <FiImage className="text-2xl text-slate-400" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <FiUpload />
            {buttonLabel}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => onChange(event.target.files?.[0] || null)}
            />
          </label>
          {(preview || file) && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
              onClick={onRemove}
              disabled={disabled}
            >
              <FiTrash2 />
              {file ? 'Clear selected' : 'Remove'}
            </button>
          )}
        </div>
      </div>
      {progressValue !== null && (
        <div className="max-w-md">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-cyan-600 transition-all"
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">Uploading {label.toLowerCase()} {progressValue}%</p>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}

export default ImageUploader
