import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./provider/AuthProvider";
import AppRoutes from "./router/routes";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}