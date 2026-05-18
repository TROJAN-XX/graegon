import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

import { auth, db } from "../firebase";

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [inviteCode, setInviteCode] = useState("graegon-private");

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      }));

      setUsers(userList);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "group", "main"), (docSnap) => {
      if (docSnap.exists()) {
        setInviteCode(docSnap.data().inviteCode);
      }
    });

    return () => unsubscribe();
  }, []);

  const updateUserStatus = async (userId, status) => {
    await updateDoc(doc(db, "users", userId), {
      status,
    });
  };

  const generateInviteCode = async () => {
    const newCode = `graegon-${Math.random().toString(36).substring(2, 10)}`;

    await setDoc(doc(db, "group", "main"), {
      inviteCode: newCode,
      updatedAt: serverTimestamp(),
    });

    setInviteCode(newCode);
  };

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/join/${inviteCode}`;
    await navigator.clipboard.writeText(link);
    alert("Invite link copied");
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>Graegon Admin</h1>
          <p>Manage users and invite link</p>
        </div>

        <div className="admin-actions">
          <button onClick={() => (window.location.href = "/chat")}>
            Go to Chat
          </button>

          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="invite-card">
        <h2>Invite Link</h2>

        <input
          value={`${window.location.origin}/join/${inviteCode}`}
          readOnly
        />

        <div className="invite-actions">
          <button onClick={copyInviteLink}>Copy Link</button>
          <button onClick={generateInviteCode}>Regenerate Link</button>
        </div>
      </div>

      <div className="user-list">
        {users.length === 0 && <p>No users found.</p>}

        {users.map((user) => (
          <div className="user-card" key={user.id}>
            <div>
              <h3>
                {user.name || "Unknown User"}
                {user.role === "admin" && (
                  <span className="verified-tick">✓</span>
                )}
              </h3>

              <p>{user.email}</p>
              <span className={`status ${user.status}`}>{user.status}</span>
            </div>

            {user.role !== "admin" && (
              <div className="action-buttons">
                <button
                  className="approve"
                  onClick={() => updateUserStatus(user.id, "approved")}
                >
                  Approve
                </button>

                <button
                  className="reject"
                  onClick={() => updateUserStatus(user.id, "rejected")}
                >
                  Reject
                </button>

                <button
                  className="pending"
                  onClick={() => updateUserStatus(user.id, "pending")}
                >
                  Revoke
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminPanel;
