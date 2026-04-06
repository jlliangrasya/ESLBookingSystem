import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./Routes";
import ServerWakeUp from "./components/ServerWakeUp";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";

const App = () => {
  return (
    <ServerWakeUp>
      <Router>
        <AppRoutes />
        <PWAUpdatePrompt />
      </Router>
    </ServerWakeUp>
  );
};

export default App;
