import { uploadCustomerImage } from './cloudinaryService'

export const uploadCustomerPhoto = async (customerId, file, onProgress) => {
  const upload = await uploadCustomerImage(customerId, file, 'profile', onProgress)
  return upload.url
}

export default {
  uploadCustomerPhoto,
}
