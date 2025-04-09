import { FaBook, FaRegLightbulb, FaClock, FaPencilAlt } from "react-icons/fa";
import "../index.css";

const LearnMore = () => {
  return (
    <section className="py-5 bg-light" style={{ height: "80vh" }}>
      <div className="container text-center">
        <h2 className="mb-5 text-primary font-weight-bold">
          Why Choose Eunitalk?
        </h2>
        <div className="row justify-content-center">
          <div className="col-lg-3 col-md-4 col-12 mb-4">
            <div className="feature-box p-4 bg-white rounded shadow-lg d-flex flex-column align-items-center">
              <FaBook size={50} color="#65C3E8" />
              <h5 className="mt-3">📚 Services Offered</h5>
              <p>We offer online English tutorials for all ages and levels.</p>
            </div>
          </div>
          <div className="col-lg-3 col-md-4 col-12 mb-4">
            <div className="feature-box p-4 bg-white rounded shadow-lg d-flex flex-column align-items-center">
              <FaRegLightbulb size={50} color="#65C3E8" />
              <h5 className="mt-3">🎯 Personalized Lessons</h5>
              <p>Each lesson is customized to the student's needs and pace.</p>
            </div>
          </div>
          <div className="col-lg-3 col-md-4 col-12 mb-4">
            <div className="feature-box p-4 bg-white rounded shadow-lg d-flex flex-column align-items-center">
              <FaClock size={50} color="#65C3E8" />
              <h5 className="mt-3">⏰ Flexible Schedule</h5>
              <p>Book your classes at your convenience with flexible hours.</p>
            </div>
          </div>
          <div className="col-lg-3 col-md-4 col-12 mb-4">
            <div className="feature-box p-4 bg-white rounded shadow-lg d-flex flex-column align-items-center">
              <FaPencilAlt size={50} color="#65C3E8" />
              <h5 className="mt-3">📝 Subjects</h5>
              <p>
                Grammar, Speaking, Reading Comprehension, Vocabulary, and more.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LearnMore;
