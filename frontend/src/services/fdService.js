import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase'
import { COLLECTIONS, normalizeText } from './firestoreService'

export const getFdAccount = async (customerId) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) return null

  const snapshot = await getDoc(doc(db, COLLECTIONS.fdAccounts, normalizedId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export default {
  getFdAccount,
}
