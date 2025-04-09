import React from "react";
import { Navbar, Nav, Container, Dropdown } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/EuniTalk_Logo.png";
import profile from "../assets/profile.png";
import school from "../assets/school.png";
import students from "../assets/students.png";
import sched from "../assets/schedule.png";

const NavBar: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove auth token
    navigate("/home"); // Redirect to login page
  };

  return (
    <Navbar bg="white" expand="lg" className="shadow-sm shadow-#65C3E8">
      <Container>
        <Navbar.Brand as={Link} to="/admin-dashboard">
          <img
            src={logo}
            alt="Logo"
            height="40"
            className="d-inline-block align-top"
          />
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="ms-auto nav-links ">
            <Nav.Link as={Link} to="/schedule">
              <img
                src={sched}
                alt="Schedule"
                height="30"
                className="d-inline-block align-top"
              />
            </Nav.Link>
            <Nav.Link as={Link} to="/students">
              <img
                src={students}
                alt="Students"
                height="28"
                className="d-inline-block align-top"
              />
            </Nav.Link>
            <Nav.Link as={Link} to="/school">
              <img
                src={school}
                alt="School"
                height="30"
                className="d-inline-block align-top"
              />
            </Nav.Link>
            {/* <Nav.Link as={Link} to="/profile">
              <img
                src={profile}
                alt="Profile"
                height="30"
                className="d-inline-block align-top"
              />
            </Nav.Link> */}

            {/*  Profile Dropdown */}
            <Dropdown align="end">
              <Dropdown.Toggle as={Nav.Link} className="profile-dropdown">
                <img src={profile} alt="Profile" height="30" />
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item as={Link} to="/profile">
                  Profile
                </Dropdown.Item>
                <Dropdown.Item onClick={handleLogout}>Logout</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default NavBar;
