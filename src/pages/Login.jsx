import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "../firebase";

function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
          name,
          email,
          role: "user",
          status: "pending",
          createdAt: serverTimestamp(),
        });

        navigate("/waiting");
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );

        const user = userCredential.user;
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          alert("User data not found");
          return;
        }

        const userData = userSnap.data();

        if (userData.role === "admin") {
          navigate("/admin");
        } else if (userData.status === "approved") {
          navigate("/chat");
        } else {
          navigate("/waiting");
        }
      }
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Graegon</h1>
        <p>Private group chat with admin approval</p>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">
            {isRegister ? "Request Access" : "Login"}
          </button>
        </form>

        <button
          className="switch-btn"
          onClick={() => setIsRegister(!isRegister)}
        >
          {isRegister
            ? "Already have an account? Login"
            : "New user? Request access"}
        </button>
      </div>
    </div>
  );
}

export default Login;
