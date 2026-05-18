import { signOut } from "firebase/auth";
import { auth } from "../firebase";

function Waiting() {
  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  return (
    <div className="waiting-page">
      <div className="waiting-card">
        <h1>Access Pending</h1>
        <p>Your request to join Graegon is waiting for admin approval.</p>
        <button onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}

export default Waiting;
