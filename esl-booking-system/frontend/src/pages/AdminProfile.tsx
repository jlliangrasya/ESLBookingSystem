import React, { useState, useEffect } from "react";
import { Form, Button, Container, Card } from "react-bootstrap";
import axios from "axios";
import NavBar from "../components/Navbar";

const AdminProfile: React.FC = () => {
  const [admin, setAdmin] = useState({
    student_name: "",
    email: "",
    password: "********", // Initially displayed as dots
  });
  const [isEditing, setIsEditing] = useState(false); // Tracks edit mode

  useEffect(() => {
    // ✅ Fetch logged-in admin details
    const fetchAdmin = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/admin/profile`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        console.log("Admin Data:", response.data); // ✅ Debugging

        setAdmin({
          student_name: response.data.student_name || "",
          email: response.data.email || "",
          password: "********", // Always hide password initially
        });
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          console.error(
            "Error fetching profile:",
            error.response?.data || error.message
          );
        } else if (error instanceof Error) {
          console.error("Error fetching profile:", error.message);
        } else {
          console.error("An unknown error occurred");
        }
      }
    };

    fetchAdmin();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAdmin({ ...admin, [e.target.name]: e.target.value });
  };

  const handleEdit = () => {
    setIsEditing(true);
    setAdmin((prev) => ({ ...prev, password: "" })); // Allow password change when editing
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token");

      //  Send password only if changed
      const updatedData = {
        student_name: admin.student_name,
        email: admin.email,
        ...(admin.password !== "" &&
          admin.password !== "********" && { password: admin.password }),
      };

      console.log("Sending Data:", updatedData); // ✅ Debugging

      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/admin/profile`,
        updatedData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert("Profile updated successfully!");
      setIsEditing(false);
      setAdmin((prev) => ({
        ...prev,
        password: "********", // Reset password display after saving
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(
          "Error updating profile:",
          error.response?.data || error.message
        );
      } else if (error instanceof Error) {
        console.error("Error updating profile:", error.message);
      } else {
        console.error("An unknown error occurred");
      }
    }
  };

  return (
    <>
      <NavBar />
      <Container>
        <Card className="mt-5 p-4">
          <h3>Admin Profile</h3>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control
                type="text"
                name="student_name"
                value={admin.student_name}
                onChange={handleChange}
                disabled={!isEditing} // Editable only in edit mode
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={admin.email}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={admin.password}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </Form.Group>

            {/* ✅ Toggle between Edit and Save button */}
            {isEditing ? (
              <Button variant="success" onClick={handleSave}>
                Save
              </Button>
            ) : (
              <Button variant="primary" onClick={handleEdit}>
                Edit
              </Button>
            )}
          </Form>
        </Card>
      </Container>
    </>
  );
};

export default AdminProfile;
