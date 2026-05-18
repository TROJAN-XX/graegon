import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth, db } from "../firebase";

function Chat() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [text, setText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [openReactionId, setOpenReactionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  // Debounced activity update to reduce Firestore writes
  const debouncedUpdateActivityRef = useRef(null);

  const filteredMessages = useMemo(() => {
    if (!searchText.trim()) return messages;

    return messages.filter((message) =>
      message.text?.toLowerCase().includes(searchText.toLowerCase()),
    );
  }, [messages, searchText]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/");
        return;
      }

      const userSnap = await getDoc(doc(db, "users", user.uid));

      if (!userSnap.exists()) {
        navigate("/");
        return;
      }

      const data = userSnap.data();

      if (data.status !== "approved" && data.role !== "admin") {
        navigate("/waiting");
        return;
      }

      const userData = {
        id: user.uid,
        ...data,
      };

      setCurrentUserData(userData);

      await setDoc(doc(db, "presence", user.uid), {
        name: data.name || "Admin",
        role: data.role,
        online: true,
        lastActive: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });

      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  const updateActivity = useCallback(async () => {
    if (!currentUserData) return;

    try {
      await setDoc(doc(db, "presence", currentUserData.id), {
        name: currentUserData.name || "Admin",
        role: currentUserData.role,
        online: true,
        lastActive: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating activity:", error);
    }
  }, [currentUserData]);

  // Debounced updateActivity to avoid excessive writes
  const debouncedUpdateActivity = useCallback(() => {
    if (debouncedUpdateActivityRef.current) {
      clearTimeout(debouncedUpdateActivityRef.current);
    }
    debouncedUpdateActivityRef.current = setTimeout(() => {
      updateActivity();
    }, 1000); // Debounce by 1 second
  }, [updateActivity]);

  useEffect(() => {
    if (!currentUserData) return;

    debouncedUpdateActivity();

    const interval = setInterval(() => {
      updateActivity();
    }, 60 * 1000);

    const handleUserActivity = () => {
      debouncedUpdateActivity();
    };

    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("click", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);

    return () => {
      clearInterval(interval);
      if (debouncedUpdateActivityRef.current) {
        clearTimeout(debouncedUpdateActivityRef.current);
      }
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
    };
  }, [currentUserData, debouncedUpdateActivity]);

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const messageList = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        setMessages(messageList);

        if (currentUserData) {
          snapshot.docs.forEach((docItem) => {
            const msg = docItem.data();

            if (
              msg.senderId !== currentUserData.id &&
              !msg.seenBy?.includes(currentUserData.id)
            ) {
              updateDoc(doc(db, "messages", docItem.id), {
                seenBy: arrayUnion(currentUserData.id),
              }).catch((error) =>
                console.error("Error updating seenBy:", error),
              );
            }
          });
        }
      },
      (error) => console.error("Error fetching messages:", error),
    );

    return () => unsubscribe();
  }, [currentUserData]);

  useEffect(() => {
    if (!currentUserData) return;

    const unsubscribe = onSnapshot(collection(db, "presence"), (snapshot) => {
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      const activeUsers = snapshot.docs
        .map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }))
        .filter((user) => {
          const lastActive = user.lastActive?.toDate
            ? user.lastActive.toDate().getTime()
            : 0;

          return now - lastActive <= fiveMinutes;
        });

      setOnlineUsers(activeUsers);
    });

    return () => unsubscribe();
  }, [currentUserData]);

  useEffect(() => {
    if (!currentUserData) return;

    const q = query(collection(db, "typing"), where("isTyping", "==", true));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs
        .map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }))
        .filter((user) => user.id !== currentUserData.id);

      setTypingUsers(users);
    });

    return () => unsubscribe();
  }, [currentUserData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredMessages]);

  const handleTyping = async (value) => {
    setText(value);
    debouncedUpdateActivity();

    if (!currentUserData) return;

    try {
      await setDoc(doc(db, "typing", currentUserData.id), {
        name: currentUserData.name || "Admin",
        isTyping: value.trim().length > 0,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating typing status:", error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!text.trim() || !currentUserData) return;

    try {
      await addDoc(collection(db, "messages"), {
        type: "text",
        text: text.trim(),
        senderId: currentUserData.id,
        senderName: currentUserData.name || "Admin",
        senderRole: currentUserData.role,
        seenBy: [currentUserData.id],
        reactions: {},
        createdAt: serverTimestamp(),
      });

      setText("");
      updateActivity();

      await setDoc(doc(db, "typing", currentUserData.id), {
        name: currentUserData.name || "Admin",
        isTyping: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const toggleReaction = async (message, emoji) => {
    if (!currentUserData) return;

    const currentReactions = message.reactions || {};
    const users = currentReactions[emoji] || [];
    const alreadyReacted = users.includes(currentUserData.id);

    const updatedUsers = alreadyReacted
      ? users.filter((id) => id !== currentUserData.id)
      : [...users, currentUserData.id];

    try {
      await updateDoc(doc(db, "messages", message.id), {
        [`reactions.${emoji}`]: updatedUsers,
      });
    } catch (error) {
      console.error("Error toggling reaction:", error);
    }

    debouncedUpdateActivity();
  };

  const getTopReaction = (message) => {
    const reactions = message.reactions || {};
    let topEmoji = null;
    let topCount = 0;

    reactionEmojis.forEach((emoji) => {
      const count = reactions[emoji]?.length || 0;

      if (count > topCount) {
        topEmoji = emoji;
        topCount = count;
      }
    });

    if (!topEmoji) return null;

    return {
      emoji: topEmoji,
      count: topCount,
    };
  };

  const deleteMessage = async (messageId) => {
    if (currentUserData?.role !== "admin") return;

    const confirmDelete = window.confirm("Delete this message?");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "messages", messageId));
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const clearChat = async () => {
    if (currentUserData?.role !== "admin") return;

    const confirmClear = window.confirm(
      "Are you sure you want to clear all chat messages?",
    );

    if (!confirmClear) return;

    try {
      const messagesSnapshot = await getDocs(collection(db, "messages"));

      const deletePromises = messagesSnapshot.docs.map((messageDoc) =>
        deleteDoc(doc(db, "messages", messageDoc.id)),
      );

      await Promise.all(deletePromises);

      alert("Chat cleared successfully");
    } catch (error) {
      console.error("Error clearing chat:", error);
      alert("Failed to clear chat. Please try again.");
    }
  };

  const handleLogout = async () => {
    if (debouncedUpdateActivityRef.current) {
      clearTimeout(debouncedUpdateActivityRef.current);
    }

    if (currentUserData) {
      try {
        await setDoc(doc(db, "presence", currentUserData.id), {
          name: currentUserData.name || "Admin",
          role: currentUserData.role,
          online: false,
          lastActive: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });

        await setDoc(doc(db, "typing", currentUserData.id), {
          name: currentUserData.name || "Admin",
          isTyping: false,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error during logout cleanup:", error);
      }
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
    navigate("/");
  };

  const getSeenText = (message) => {
    if (message.senderId !== currentUserData?.id) return "";

    const seenCount =
      message.seenBy?.filter((id) => id !== currentUserData.id).length || 0;

    return seenCount > 0 ? `Seen by ${seenCount}` : "Delivered";
  };

  if (loading) {
    return (
      <div className="waiting-page">
        <div className="waiting-card">
          <h1>Loading Graegon...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div>
          <h1>Graegon</h1>
          <p>{onlineUsers.length} online</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          {currentUserData?.role === "admin" && (
            <>
              <button onClick={clearChat}>Clear Chat</button>
              <button onClick={() => navigate("/admin")}>Admin Panel</button>
            </>
          )}

          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="online-users">
        {onlineUsers.map((user) => (
          <span key={user.id} className="online-user">
            <span className="online-dot"></span>
            {user.name}
            {user.role === "admin" && <span className="verified-tick">✓</span>}
          </span>
        ))}
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder="Search messages..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div className="chat-box">
        <div className="messages">
          {filteredMessages.length === 0 && (
            <p className="no-results">No messages found.</p>
          )}

          {filteredMessages.map((message) => {
            const topReaction = getTopReaction(message);

            return (
              <div
                key={message.id}
                className={
                  message.senderId === currentUserData?.id
                    ? "message own"
                    : "message"
                }
              >
                <div className="message-top">
                  <strong>
                    {message.senderName}
                    {message.senderRole === "admin" && (
                      <span className="verified-tick">✓</span>
                    )}
                  </strong>

                  {currentUserData?.role === "admin" && (
                    <button
                      className="delete-message-btn"
                      onClick={() => deleteMessage(message.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>

                <p>{message.text}</p>

                <div className="whatsapp-reaction-area">
                  <button
                    type="button"
                    className="reaction-trigger"
                    onClick={() =>
                      setOpenReactionId(
                        openReactionId === message.id ? null : message.id,
                      )
                    }
                  >
                    ☺
                  </button>

                  {openReactionId === message.id && (
                    <div className="reaction-dropdown">
                      {reactionEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            toggleReaction(message, emoji);
                            setOpenReactionId(null);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {topReaction && (
                    <div className="selected-reaction">
                      <span>{topReaction.emoji}</span>
                      <small>{topReaction.count}</small>
                    </div>
                  )}
                </div>

                <div className="message-bottom">
                  <span>
                    {message.createdAt?.toDate
                      ? message.createdAt.toDate().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>

                  <span>{getSeenText(message)}</span>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef}></div>
        </div>

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers[0].name} is typing...
          </div>
        )}

        <form className="message-form" onSubmit={sendMessage}>
          <input
            type="text"
            placeholder="Type your message..."
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
          />

          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}

export default Chat;
