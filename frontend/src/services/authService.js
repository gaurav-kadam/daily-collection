import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app'
import { auth, db, firebaseConfig } from '../firebase/firebase'
import { COLLECTIONS, USER_ROLES } from './firestoreService'

const userRef = (userId) => doc(db, COLLECTIONS.users, userId)
const PROFILE_CACHE_KEY = 'auth-profile-cache'
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000

const USERNAME_EMAIL_ALIASES = {
  admin: 'admin@daily-collection-management.local',
}

const resolveLoginEmail = (value) => {
  const loginId = value.trim().toLowerCase()
  return USERNAME_EMAIL_ALIASES[loginId] || loginId
}

const normalizeAuthUser = (firebaseUser, profile = {}) => ({
  userId: firebaseUser.uid,
  id: firebaseUser.uid,
  fullName: profile.fullName || firebaseUser.displayName || firebaseUser.email,
  email: profile.email || firebaseUser.email || '',
  mobile: profile.mobile || '',
  role: profile.role || USER_ROLES.collector,
  status: profile.status || 'active',
  permissions: profile.permissions || {},
  profileImage: profile.profileImage || '',
  createdAt: profile.createdAt || null,
})

const readCachedProfile = (userId) => {
  if (typeof window === 'undefined') return null
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null')
    if (
      cached?.userId === userId &&
      cached?.createdAt &&
      Date.now() - cached.createdAt < PROFILE_CACHE_TTL_MS
    ) {
      return cached.profile
    }
  } catch {
    window.sessionStorage.removeItem(PROFILE_CACHE_KEY)
  }
  return null
}

const writeCachedProfile = (userId, profile) => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(
    PROFILE_CACHE_KEY,
    JSON.stringify({ userId, profile, createdAt: Date.now() }),
  )
}

export const subscribeToAuth = (callback) => onAuthStateChanged(auth, callback)

export const getUserProfile = async (userId) => {
  const snapshot = await getDoc(userRef(userId))
  if (!snapshot.exists()) return null
  return { userId: snapshot.id, id: snapshot.id, ...snapshot.data() }
}

export const ensureUserProfile = async (firebaseUser) => {
  const cachedProfile = readCachedProfile(firebaseUser.uid)
  if (cachedProfile) {
    return normalizeAuthUser(firebaseUser, cachedProfile)
  }

  const existingProfile = await getUserProfile(firebaseUser.uid)
  if (existingProfile) {
    const backfill = {}
    if (!existingProfile.role) backfill.role = USER_ROLES.collector
    if (!existingProfile.status) backfill.status = 'active'
    if (!existingProfile.permissions) backfill.permissions = {}
    if (Object.keys(backfill).length) {
      updateDoc(userRef(firebaseUser.uid), {
        ...backfill,
        updatedAt: serverTimestamp(),
      }).catch(() => {})
    }
    const normalized = normalizeAuthUser(firebaseUser, existingProfile)
    writeCachedProfile(firebaseUser.uid, existingProfile)
    return normalized
  }

  const newProfile = {
    userId: firebaseUser.uid,
    fullName: firebaseUser.displayName || firebaseUser.email || 'Collector',
    email: firebaseUser.email || '',
    role: USER_ROLES.collector,
    mobile: '',
    status: 'active',
    permissions: {},
    profileImage: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  }

  await setDoc(userRef(firebaseUser.uid), newProfile)
  writeCachedProfile(firebaseUser.uid, newProfile)
  return normalizeAuthUser(firebaseUser, newProfile)
}

export const loginWithEmail = async ({ email, password, rememberMe = true }) => {
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence,
  )
  const credential = await signInWithEmailAndPassword(
    auth,
    resolveLoginEmail(email),
    password,
  )
  const profile = await ensureUserProfile(credential.user)
  updateDoc(userRef(credential.user.uid), {
    email: credential.user.email || profile.email || '',
    lastLogin: serverTimestamp(),
  }).catch(() => {})
  return profile
}

export const logoutUser = () => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(PROFILE_CACHE_KEY)
  }
  return signOut(auth)
}

export const resetPassword = (email) =>
  sendPasswordResetEmail(auth, resolveLoginEmail(email))

const getSecondaryAuth = () => {
  const appName = 'user-registration'
  const existingApp = getApps().find((app) => app.name === appName)
  const secondaryApp = existingApp || initializeApp(firebaseConfig, appName)
  return {
    secondaryApp,
    secondaryAuth: getAuth(secondaryApp),
  }
}

export const registerUser = async ({
  fullName,
  email,
  password,
  mobile = '',
  role = USER_ROLES.collector,
    status = 'active',
    permissions = {},
    profileImage = '',
}) => {
  const normalizedRole = Object.values(USER_ROLES).includes(role)
    ? role
    : USER_ROLES.collector
  const { secondaryApp, secondaryAuth } = getSecondaryAuth()

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      resolveLoginEmail(email),
      password,
    )

    if (fullName) {
      await updateProfile(credential.user, { displayName: fullName })
    }

    const profile = {
      userId: credential.user.uid,
      fullName: normalizeAuthUser(credential.user, { fullName }).fullName,
      email: credential.user.email || resolveLoginEmail(email),
      mobile,
      role: normalizedRole,
      status,
      permissions: permissions && typeof permissions === 'object' ? permissions : {},
      profileImage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLogin: null,
    }

    await setDoc(userRef(credential.user.uid), profile)
    await signOut(secondaryAuth)
    return profile
  } finally {
    const activeSecondary = getApps().find((app) => app.name === secondaryApp.name)
    if (activeSecondary && activeSecondary.name !== getApp().name) {
      await deleteApp(activeSecondary)
    }
  }
}

export default {
  subscribeToAuth,
  getUserProfile,
  ensureUserProfile,
  loginWithEmail,
  logoutUser,
  resetPassword,
  registerUser,
}
