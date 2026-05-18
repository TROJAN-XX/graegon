import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase";

function JoinGroup() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [validInvite, setValidInvite] = useState(false);

  useEffect(() => {
    const checkInvite = async () => {
      const groupSnap = await getDoc(doc(db, "group", "main"));

      if (!groupSnap.exists()) {
        setValidInvite(inviteCode === "graegon-private");
      } else {
        setValidInvite(groupSnap.data().inviteCode === inviteCode);
      }

      setLoading(false);
    };

    checkInvite();
  }, [inviteCode]);

  const handleJoin = () => {
    if (!validInvite) {
      alert("Invalid invite link");
      return;
    }

    if (!auth.currentUser) {
      navigate("/");
      return;
    }

    navigate("/waiting");
  };

  if (loading) {
    return (
      <div className="waiting-page">
        <div className="waiting-card">
          <h1>Checking invite...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="waiting-page">
      <div className="waiting-card">
        <h1>{validInvite ? "Join Graegon" : "Invalid Invite"}</h1>

        <p>
          {validInvite
            ? "You have been invited to join the private group discussion."
            : "This invite link is invalid or expired."}
        </p>

        {validInvite && <button onClick={handleJoin}>Continue</button>}
      </div>
    </div>
  );
}

export default JoinGroup;
