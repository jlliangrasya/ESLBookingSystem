import { Card, Form } from "react-bootstrap";
import { useState } from "react";

const TutorialPackages = () => {
  const [currency, setCurrency] = useState("RMB");
  const [subject, setSubject] = useState("English");

  const currencyOptions = ["RMB", "USD", "KRW", "VND"];

  const convertPrice = (price: number, currency: string) => {
    const rates: Record<string, number> = {
      RMB: 1,
      USD: 0.14,
      KRW: 190,
      VND: 3300,
    };
    const converted = price * rates[currency];
    const symbols: Record<string, string> = {
      RMB: "¥",
      USD: "$",
      KRW: "₩",
      VND: "₫",
    };
    return `${symbols[currency]} ${converted.toLocaleString()}`;
  };

  const kidsPackages = [
    { sessions: 40, free: 1, price: 1250 },
    { sessions: 60, free: 1, price: 1750 },
    { sessions: 100, free: 5, price: 2800 },
    { sessions: 150, free: 5, price: 4000 },
  ];

  const adultsPackages = [
    { sessions: 40, free: 1, price: 1400 },
    { sessions: 60, free: 1, price: 2100 },
    { sessions: 100, free: 5, price: 3500 },
    { sessions: 150, free: 5, price: 5200 },
  ];

  return (
    <section className="py-5 bg-white" id="tutorial-packages">
      <div className="container text-center">
        <h2 className="mb-4 fw-bold display-5 text-primary">
          📦 Our Tutorial Packages
        </h2>

        {/* Currency & Subject Selection */}
        <div className="d-flex flex-wrap justify-content-center gap-3 mb-5">
          <Form.Select
            style={{ width: "220px" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="shadow-sm rounded-3"
          >
            {currencyOptions.map((cur) => (
              <option key={cur} value={cur}>
                View in {cur}
              </option>
            ))}
          </Form.Select>

          <div className="d-flex gap-2">
            <button
              className={`btn px-4 rounded-pill fw-semibold ${
                subject === "English" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setSubject("English")}
            >
              English
            </button>
            <button
              className={`btn px-4 rounded-pill fw-semibold ${
                subject === "Math" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setSubject("Math")}
            >
              Math
            </button>
          </div>
        </div>

        {/* Kids Packages */}
        <h4 className="text-success mt-5 fw-bold fs-4">
          👧🧒 For Kids & Teens (Ages 3–17)
        </h4>
        <div className="row g-4 mt-3">
          {kidsPackages.map((pkg, index) => {
            const price = subject === "Math" ? pkg.price + 300 : pkg.price;
            return (
              <div className="col-md-3" key={index}>
                <Card className="h-100 p-3 shadow-lg border-0 rounded-5 bg-light-subtle">
                  <Card.Body className="d-flex flex-column justify-content-center text-center">
                    <div className="fs-3">🎒</div>
                    <Card.Title className="fw-bold fs-5 mt-2">
                      {pkg.sessions} + {pkg.free} Free
                    </Card.Title>
                    <Card.Text className="mt-2 small text-muted">
                      Subject: <strong>{subject}</strong>
                    </Card.Text>
                    <p className="text-success fs-5 fw-semibold mb-0">
                      {convertPrice(price, currency)}
                    </p>
                  </Card.Body>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Adults Packages */}
        <h4 className="text-secondary mt-5 fw-bold fs-4">
          🧑‍🎓 For Adults (18+)
        </h4>
        <div className="row g-4 mt-3">
          {adultsPackages.map((pkg, index) => (
            <div className="col-md-3" key={index}>
              <Card className="h-100 p-3 shadow-lg border-0 rounded-5 bg-light">
                <Card.Body className="d-flex flex-column justify-content-center text-center">
                  <div className="fs-3">📘</div>
                  <Card.Title className="fw-bold fs-5 mt-2">
                    {pkg.sessions} + {pkg.free} Free
                  </Card.Title>
                  <Card.Text className="mt-2 small text-muted">
                    Subject: <strong>{subject}</strong>
                  </Card.Text>
                  <p className="text-primary fs-5 fw-semibold mb-0">
                    {convertPrice(pkg.price, currency)}
                  </p>
                </Card.Body>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TutorialPackages;
