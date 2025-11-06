import { Outlet, Navigate } from "react-router-dom";
import { useContext } from "react";
import UserContext from "../context/Usercontext";

const ProtectedRoutes = () => {
  const context = useContext(UserContext) || {};
  const { userId } = context;

  // Treat absence of userId as unauthenticated
  const isAuthenticated = !!userId;


  return isAuthenticated ? <Outlet /> : <Navigate to="/" />;
};

export default ProtectedRoutes;
