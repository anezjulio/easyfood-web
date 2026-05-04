import { Navigate, Outlet } from "react-router-dom";
import type { AppUserRole } from "../../feature/user/model/user.types";
import { useAuth } from "../provider/useAuth";

export default function RequireRole({ allowedRoles }: { allowedRoles: AppUserRole[] }) {
  const auth = useAuth();
  const role = auth.user?.role;

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/operation" replace />;
  }

  return <Outlet />;
}
