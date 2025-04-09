import { useState, useContext } from "react";
import axios, { AxiosResponse } from "axios";
import AuthContext from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button, Form, Alert } from "react-bootstrap";

interface LoginResponse {
  token: string;
  user: {
    id: number;
    student_name: string;
    isAdmin: boolean;
  };
}

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const authContext = useContext(AuthContext);
  if (!authContext) {
    throw new Error("AuthContext must be used within an AuthProvider");
  }

  const { login } = authContext;
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res: AxiosResponse<LoginResponse> = await axios.post(
        "http://localhost:5000/api/auth/login",
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );

      login(res.data.token, res.data.user);
      navigate(
        res.data.user.isAdmin ? "/admin-dashboard" : "/studentdashboard"
      );
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || "Login failed");
      } else {
        setError("An unexpected error occurred");
      }
    }
  };

  return (
    <div>
      {error && <Alert variant="danger">{error}</Alert>}

      <Form onSubmit={handleLogin}>
        <Form.Group className="mb-3">
          <Form.Label>Email</Form.Label>
          <Form.Control
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>

        <Button type="submit" className="w-100" variant="primary">
          Login
        </Button>
      </Form>
    </div>
  );
};

export default Login;
