import { useState, useEffect } from "react";
import axios from "axios";
import NavBar from "../components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Save } from "lucide-react";

const AdminProfile: React.FC = () => {
  const [admin, setAdmin] = useState({
    name: "",
    email: "",
    password: "********",
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const fetchAdmin = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/admin/profile`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAdmin({
          name: response.data.name || "",
          email: response.data.email || "",
          password: "********",
        });
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          console.error("Error fetching profile:", error.response?.data || error.message);
        } else if (error instanceof Error) {
          console.error("Error fetching profile:", error.message);
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
    setAdmin((prev) => ({ ...prev, password: "" }));
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token");
      const updatedData = {
        name: admin.name,
        email: admin.email,
        ...(admin.password !== "" && admin.password !== "********" && {
          password: admin.password,
        }),
      };

      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/admin/profile`,
        updatedData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert("Profile updated successfully!");
      setIsEditing(false);
      setAdmin((prev) => ({ ...prev, password: "********" }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error("Error updating profile:", error.response?.data || error.message);
      } else if (error instanceof Error) {
        console.error("Error updating profile:", error.message);
      }
    }
  };

  return (
    <>
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-10">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Admin Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                type="text"
                name="name"
                value={admin.name}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                name="email"
                value={admin.email}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-password">Password</Label>
              <Input
                id="profile-password"
                type="password"
                name="password"
                value={admin.password}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder={isEditing ? "Enter new password" : ""}
              />
            </div>

            <div className="pt-2">
              {isEditing ? (
                <Button onClick={handleSave} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              ) : (
                <Button variant="outline" onClick={handleEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AdminProfile;
