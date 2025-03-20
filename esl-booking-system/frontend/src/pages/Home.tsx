import { useNavigate } from "react-router-dom";
import { Button } from "react-bootstrap";

const Home = () => {
  const navigate = useNavigate(); // Hook for navigation

  return (
    <div className="container mt-4">
      <h1>Welcome to the Eunitalk</h1>
      <Button variant="primary" onClick={() => navigate("/studentdashboard")}>
        Go to Student Dashboard
      </Button>
      <Button
        variant="secondary"
        onClick={() => navigate("/admin-dashboard")}
        className="ms-2"
      >
        Go to Admin Dashboard
      </Button>
    </div>
  );
};

export default Home;
