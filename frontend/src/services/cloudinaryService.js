const CLOUDINARY_CLOUD_NAME = 'db5zvcygk'
const CLOUDINARY_UPLOAD_PRESET = 'daily_collection_upload'
const CLOUDINARY_ASSET_FOLDER = 'daily-collection'
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`

const IMAGE_TRANSFORM = 'f_auto,q_auto'

export const validateCloudinaryImage = (file) => {
  if (!file) return ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Only JPG, PNG, and WEBP images are allowed.'
  }
  if (file.size >= 2 * 1024 * 1024) {
    return 'Photo must be smaller than 2MB.'
  }
  return ''
}

export const getOptimizedImageUrl = (url, options = {}) => {
  if (!url || !String(url).includes('/upload/')) return url || ''

  const width = options.width ? `,w_${options.width}` : ''
  const height = options.height ? `,h_${options.height}` : ''
  const crop = options.crop ? `,c_${options.crop}` : ''
  const transform = `${IMAGE_TRANSFORM}${width}${height}${crop}`

  return String(url).replace('/upload/', `/upload/${transform}/`)
}

export const uploadImage = async (
  file,
  {
    folder = CLOUDINARY_ASSET_FOLDER,
    publicId,
    tags = [],
    onProgress,
  } = {},
) => {
  const validationError = validateCloudinaryImage(file)
  if (validationError) throw new Error(validationError)

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  formData.append('folder', folder)
  if (publicId) formData.append('public_id', publicId)
  if (tags.length) formData.append('tags', tags.join(','))

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', CLOUDINARY_UPLOAD_URL)

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    }

    request.onload = () => {
      let response
      try {
        response = JSON.parse(request.responseText || '{}')
      } catch {
        response = null
      }

      if (request.status >= 200 && request.status < 300 && response?.secure_url) {
        onProgress?.(100)
        resolve({
          url: getOptimizedImageUrl(response.secure_url),
          secureUrl: response.secure_url,
          publicId: response.public_id || '',
          width: response.width || 0,
          height: response.height || 0,
          format: response.format || '',
        })
        return
      }

      reject(new Error(response?.error?.message || 'Image upload failed. Please try again.'))
    }

    request.onerror = () => reject(new Error('Image upload failed. Check your connection.'))
    request.send(formData)
  })
}

export const uploadCustomerImage = (customerId, file, type = 'profile', onProgress) =>
  uploadImage(file, {
    folder: `${CLOUDINARY_ASSET_FOLDER}/customers/${customerId}`,
    publicId: `${type}-${Date.now()}`,
    tags: ['customer', type],
    onProgress,
  })

export default {
  uploadImage,
  uploadCustomerImage,
  getOptimizedImageUrl,
  validateCloudinaryImage,
}
