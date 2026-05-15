import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase/firebase'

export const uploadCustomerPhoto = async (customerId, file) => {
  const extension = file.name?.split('.').pop() || 'jpg'
  const filePath = `customerPhotos/${customerId}/${Date.now()}.${extension}`
  const storageReference = ref(storage, filePath)
  await uploadBytes(storageReference, file)
  return getDownloadURL(storageReference)
}

export default {
  uploadCustomerPhoto,
}
