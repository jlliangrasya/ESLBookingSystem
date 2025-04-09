import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "react-bootstrap";
import Login from "../components/Login";
import Register from "../components/Register.tsx";
import LearnMore from "../components/LearnMore.tsx";
import TutorialPackages from "../components/TutorialPackages.tsx";
import Footer from "../components/Footer.tsx";

const Home = () => {
  const navigate = useNavigate();
  const [showRegister, setShowRegister] = useState(false);

  const toggleAuth = () => {
    setShowRegister((prev) => !prev);
  };

  return (
    <div className="container mt-5">
      <div className="row">
        {/* Optional Left Content - can be used for text, image, logo */}
        <div className="col-md-6 d-none d-md-flex align-items-center justify-content-center">
          <div>
            <h1 className="display-4 fw-bold text-primary">
              Welcome to Eunitalk
            </h1>
            <p className="lead text-muted">
              Your gateway to personalized learning. Book lessons, manage your
              sessions, and more.
            </p>
            <div className="mt-4">
              <Button
                variant="outline-primary"
                onClick={() =>
                  document
                    .getElementById("learn-more")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="me-2"
              >
                Learn More
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() =>
                  document
                    .getElementById("tutorial-packages")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Tutorial Packages
              </Button>
            </div>
          </div>
        </div>

        {/* Login/Register Card on the Right */}
        <div className="col-md-6 d-flex justify-content-center align-items-center mt-5">
          <div
            className="card shadow p-4 w-100"
            style={{ maxWidth: "450px", borderRadius: "20px" }}
          >
            <h3 className="text-center mb-3 text-primary fw-semibold">
              {showRegister ? "Register" : "Login"}
            </h3>
            {showRegister ? <Register /> : <Login />}

            <Button
              variant="link"
              onClick={toggleAuth}
              className="mt-3 text-decoration-none text-center w-100"
            >
              {showRegister
                ? "Already have an account? Log in here."
                : "Are you a new student? Register here."}
            </Button>
          </div>
        </div>
      </div>
      <section
        className="py-5 bg-light"
        id="learn-more"
        style={{ marginTop: "110px" }}
      >
        <LearnMore />
      </section>
      <section className="py-5" id="tutorial-packages">
        <TutorialPackages />
      </section>

      <Footer />
    </div>
  );
};

export default Home;
