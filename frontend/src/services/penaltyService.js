import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import {
  COLLECTIONS,
  USER_ROLES,
  docsWithIds,
  pageLimit,
} from './firestoreService'

const penaltiesRef = collection(db, COLLECTIONS.penalties)

export const listenPenalties = (
  currentUser,
  callback,
  onError,
  { status = 'active', pageSize = 100 } = {},
) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [
          where('collectorId', '==', currentUser.userId),
          where('status', '==', status),
          orderBy('updatedAt', 'desc'),
          limit(pageLimit(pageSize)),
        ]
      : [
          where('status', '==', status),
          orderBy('updatedAt', 'desc'),
          limit(pageLimit(pageSize)),
        ]

  return onSnapshot(
    query(penaltiesRef, ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export default {
  listenPenalties,
}
