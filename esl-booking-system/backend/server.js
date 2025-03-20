const jwt = require("jsonwebtoken");

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const packageRoutes = require("./routes/packageRoutes.js");
const bookingRoutes = require("./routes/bookingRoutes.js");
const studentRoutes = require("./routes/studentRoutes.js");
const adminRoutes =  require("./routes/adminRoutes.js");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', packageRoutes);
app.use(bookingRoutes);
app.use('/api/student', studentRoutes);
app.use("/api/admin", adminRoutes); // Mount admin routes

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
