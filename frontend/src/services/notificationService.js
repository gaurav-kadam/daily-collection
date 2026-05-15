import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import { COLLECTIONS, docsWithIds } from './firestoreService'

const notificationsRef = collection(db, COLLECTIONS.notifications)

export const listenNotifications = (userId, callback, onError) => {
  if (!userId) return () => {}

  return onSnapshot(
    query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50),
    ),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const markNotificationRead = (notificationId) =>
  updateDoc(doc(db, COLLECTIONS.notifications, notificationId), {
    isRead: true,
    readAt: serverTimestamp(),
  })

export default {
  listenNotifications,
  markNotificationRead,
}
