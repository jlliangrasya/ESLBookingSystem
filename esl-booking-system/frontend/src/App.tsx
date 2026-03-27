import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./Routes";
import ServerWakeUp from "./components/ServerWakeUp";

const App = () => {
  return (
    <ServerWakeUp>
      <Router>
        <AppRoutes />
      </Router>
    </ServerWakeUp>
  );
};

export default App;
