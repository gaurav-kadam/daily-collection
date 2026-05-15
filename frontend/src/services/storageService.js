import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { storage } from '../firebase/firebase'

export const uploadCustomerPhoto = async (customerId, file, onProgress) => {
  const extension = file.name?.split('.').pop() || 'jpg'
  const filePath = `customerPhotos/${customerId}/${Date.now()}.${extension}`
  const storageReference = ref(storage, filePath)

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageReference, file)

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (!onProgress) return
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        onProgress(progress)
      },
      reject,
      async () => {
        onProgress?.(100)
        resolve(getDownloadURL(uploadTask.snapshot.ref))
      },
    )
  })
}

export default {
  uploadCustomerPhoto,
}
