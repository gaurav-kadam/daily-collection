import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: 'AIzaSyDjGTrOCMb6hmNYTSVE1IkqraYJPj5t7cU',
  authDomain: 'daily-collection-management.firebaseapp.com',
  projectId: 'daily-collection-management',
  storageBucket: 'daily-collection-management.firebasestorage.app',
  messagingSenderId: '520682493376',
  appId: '1:520682493376:web:cfa2fd2eaacd3f1324a425',
  measurementId: 'G-BLJ1K6MEW9',
}

const app = initializeApp(firebaseConfig)

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

export const firebaseApp = app
export { db }
export const auth = getAuth(app)
export const functions = getFunctions(app)

export default app
