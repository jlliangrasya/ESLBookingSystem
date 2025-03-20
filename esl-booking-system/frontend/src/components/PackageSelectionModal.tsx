import React, { useState } from "react";
import { Modal, Button, Table, Form } from "react-bootstrap";
import "../index.css";

interface Package {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
}

interface Props {
  show: boolean;
  onHide: () => void;
  availablePackages: Package[];
  setSelectedPackage: (id: number) => void;
  confirmPackage: (selectedSubject: string) => void;
}

const subjects = ["ENGLISH", "MATH", "SCIENCE", "CODING"];

const PackageSelectionModal: React.FC<Props> = ({
  show,
  onHide,
  availablePackages,
  setSelectedPackage,
  confirmPackage,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedPackage, setSelectedPackageState] = useState<number | null>(
    null
  );

  const handlePackageSelect = (packageId: number) => {
    setSelectedPackage(packageId); // Update parent state
    setSelectedPackageState(packageId); // Update local state
    console.log(`Selected Package ID: ${packageId}`); // Log selection in console
  };

  const handleConfirm = () => {
    if (!selectedSubject || selectedPackage === null) {
      alert("Please select a package and a subject.");
      return;
    }
    confirmPackage(selectedSubject); // Pass selected subject
    onHide(); // Close modal
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Select a Package & Subject</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ maxHeight: "300px", overflowY: "auto" }}>
          <Table hover responsive className="custom-table">
            <thead>
              <tr>
                <th>Package Name</th>
                <th>Sessions</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {availablePackages.map((pkg) => (
                <tr
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg.id)}
                  className={selectedPackage === pkg.id ? "selected-row" : ""}
                  style={{
                    cursor: "pointer",
                  }}
                >
                  <td>{pkg.package_name}</td>
                  <td>{pkg.session_limit}</td>
                  <td>¥ {pkg.price} RMB</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        {/* Subject Selection Dropdown */}
        <Form.Group controlId="subjectSelection" className="mt-3">
          <Form.Label>Select a Subject</Form.Label>
          <Form.Control
            as="select"
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
          >
            <option value="">-- Choose Subject --</option>
            {subjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </Form.Control>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!selectedPackage || !selectedSubject}
        >
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PackageSelectionModal;
