# Daily Collection Management System

Serverless React + Firebase application for shop/customer daily savings collection, pending tracking, loans, EMI payments, and notifications.

## Stack

- React + Vite
- React Router
- Tailwind CSS
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Hosting or Vercel

## Active Architecture

```text
React Frontend
  -> Firebase Authentication
  -> Cloud Firestore
  -> Firebase Storage
```

No separate server process is required.

## Main Folders

```text
frontend/src/
  components/
  context/
  firebase/
  hooks/
  layouts/
  pages/
  routes/
  services/
  utils/
```

## Firebase Collections

- `users`
- `customers`
- `bachatAccounts`
- `bachatCollections`
- `bachatPenalties`
- `bachatClosures`
- `bachatSummary`
- `customerFinancials`
- `dailyCollections`
- `loans`
- `emiPayments`
- `notifications`

## Firebase Project

The app is configured for Firebase project `daily-collection-management` in:

- `frontend/src/firebase/firebase.js`
- `.firebaserc`

Enable these Firebase products before using the app:

- Email/Password Authentication
- Cloud Firestore
- Firebase Storage

## Setup

Install and run:

```powershell
npm install
npm run dev
```

## First Admin

Because this is serverless, create the first Firebase Auth user in Firebase Console, then create this Firestore document manually:

```text
users/{firebaseAuthUid}
```

```json
{
  "userId": "firebaseAuthUid",
  "fullName": "Admin User",
  "email": "admin@example.com",
  "role": "admin",
  "mobile": "",
  "status": "active",
  "createdAt": "server timestamp"
}
```

Collectors can log in after their Auth account exists and their `users/{uid}` document has role `collector`.

## Firebase Deploy

```powershell
cd frontend
npm run build
cd ..
firebase deploy
```

The hosting config serves `frontend/dist` and rewrites all routes to `index.html`.
