const Footer = () => {
  return (
    <footer className="bg-dark text-light py-3 mt-5 w-100">
      <div className="container text-center small">
        <div className="row justify-content-center">
          <div className="col-md-auto">
            <p className="mb-1">
              📧{" "}
              <a
                href="mailto:eunitalk@gmail.com"
                className="text-light text-decoration-none"
              >
                eunitalk@gmail.com
              </a>
            </p>
          </div>
          <div className="col-md-auto">
            <p className="mb-1">📞 0912-345-6789</p>
          </div>
          <div className="col-md-auto">
            <p className="mb-1">📍 Tacloban City, Philippines</p>
          </div>
        </div>
        <p className="mt-2 mb-0">
          &copy; {new Date().getFullYear()} Eunitalk. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
