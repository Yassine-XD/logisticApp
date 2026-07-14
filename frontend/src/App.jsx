import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./store/auth";
import { setUnauthorizedHandler } from "./lib/api";
import { Spinner } from "./components/ui";
import Toasts from "./components/Toasts";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Demands from "./pages/Demands";
import Planning from "./pages/Planning";
import Tours from "./pages/Tours";
import Drivers from "./pages/Drivers";
import Vehicles from "./pages/Vehicles";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import DriverView from "./pages/DriverView";

export default function App() {
  const { ready, user, bootstrap } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    bootstrap();
    setUnauthorizedHandler(() => navigate("/login"));
  }, []);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-accent">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  // Drivers get a dedicated mobile-first experience
  const homeFor = (u) => (u?.role === "driver" ? "/driver" : "/");

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={homeFor(user)} /> : <Login />} />

        {/* Driver mobile view (own layout) */}
        <Route
          path="/driver"
          element={
            <ProtectedRoute roles={["driver", "admin"]}>
              <DriverView />
            </ProtectedRoute>
          }
        />

        {/* Dispatcher / admin app shell */}
        <Route element={<ProtectedRoute roles={["admin", "dispatcher"]}><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/demands" element={<Demands />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/tours" element={<Tours />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/users" element={<ProtectedRoute roles={["admin"]}><Users /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute roles={["admin"]}><Settings /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to={user ? homeFor(user) : "/login"} />} />
      </Routes>
      <Toasts />
    </>
  );
}
