import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase";

import LoadingScreen from "./LoadingScreen";

function ProtectedRoute({ children, adminOnly = false }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [redirectPath, setRedirectPath] = useState("/");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRedirectPath("/");
        setAllowed(false);
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", user.uid));

      if (!userSnap.exists()) {
        setRedirectPath("/");
        setAllowed(false);
        setLoading(false);
        return;
      }

      const userData = userSnap.data();

      if (adminOnly && userData.role !== "admin") {
        setRedirectPath("/chat");
        setAllowed(false);
        setLoading(false);
        return;
      }

      if (userData.role === "admin" || userData.status === "approved") {
        setAllowed(true);
      } else {
        setRedirectPath("/waiting");
        setAllowed(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminOnly]);

  if (loading) {
    return <LoadingScreen text="Checking access..." />;
  }

  if (!allowed) {
    return <Navigate to={redirectPath} replace />;
  }

  return children;
}

export default ProtectedRoute;
