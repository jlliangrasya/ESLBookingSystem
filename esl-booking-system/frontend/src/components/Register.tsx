import { useState } from "react";
import axios, { AxiosError } from "axios";
import { Button, Form, Alert, Row, Col, Spinner } from "react-bootstrap";

interface RegisterProps {
  toggleAuth: () => void;
}

const Register: React.FC<RegisterProps> = ({ toggleAuth }) => {
  const [studentName, setStudentName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [age, setAge] = useState("");
  const [nationality, setNationality] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post("http://localhost:5000/api/auth/register", {
        student_name: studentName,
        email,
        password,
        guardian_name: guardianName,
        age,
        nationality,
        is_admin: false, // Prevent students from registering as admin
      });

      setSuccess("Registration successful! Redirecting to login...");
      setError(null);

      setTimeout(() => {
        toggleAuth(); // Switch to Login form
        setSuccess(null);
        setIsLoading(false);
      }, 2000);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || "Registration failed");
      setSuccess(null);
      setIsLoading(false);
    }
  };

  return (
    <div>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Form onSubmit={handleRegister}>
        <Form.Group className="mb-3">
          <Form.Label>Full Name</Form.Label>
          <Form.Control
            type="text"
            placeholder="Enter full name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            required
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Email Address</Form.Label>
          <Form.Control
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Guardian's Name</Form.Label>
          <Form.Control
            type="text"
            placeholder="Enter guardian's name"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            required
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Row>
            <Col>
              <Form.Label>Age</Form.Label>
              <Form.Control
                type="number"
                placeholder="Enter age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
              />
            </Col>
            <Col>
              <Form.Label>Nationality</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter nationality"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                required
              />
            </Col>
          </Row>
        </Form.Group>

        <Button
          type="submit"
          className="w-100"
          variant="success"
          disabled={isLoading}
        >
          {isLoading ? <Spinner animation="border" size="sm" /> : "Register"}
        </Button>
      </Form>
    </div>
  );
};

export default Register;
