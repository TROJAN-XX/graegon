# Graegon

A private real-time chatting application built using React and Firebase.

---

# Features

## Authentication

- Firebase Authentication
- Secure login/signup
- Admin role support

## Private Group Chat

- Single global group chat
- Invite-based joining
- Admin approval system
- Pending/waiting room

## Chat Features

- Real-time messaging
- Typing indicator
- Online/offline status
- Seen/delivered status
- WhatsApp-style emoji reactions
- Message search
- Auto scrolling
- Hidden scrollbars
- Incoming/outgoing animations

## Admin Features

- Approve/reject users
- Generate invite link
- Delete messages
- Clear full chat
- Admin verified badge

## UI/UX

- Responsive mobile layout
- Dark modern interface
- Animated transitions
- Protected routes

---

# Tech Stack

| Technology              | Usage               |
| ----------------------- | ------------------- |
| React                   | Frontend            |
| Firebase Authentication | User authentication |
| Firestore               | Realtime database   |
| React Router DOM        | Routing             |
| CSS3                    | Styling             |

---

# Project Structure

```bash
src/
│
├── components/
│   ├── LoadingScreen.jsx
│   └── ProtectedRoute.jsx
│
├── pages/
│   ├── Login.jsx
│   ├── JoinGroup.jsx
│   ├── Waiting.jsx
│   ├── Chat.jsx
│   └── AdminPanel.jsx
│
├── styles/
│   └── global.css
│
├── firebase.js
├── App.js
└── index.js
```
