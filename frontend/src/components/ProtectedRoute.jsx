import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";

// Guards a route by authentication + optional role list.
export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === "driver" ? "/driver" : "/"} replace />;
  }
  return children || null;
}
