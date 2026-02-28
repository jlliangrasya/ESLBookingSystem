const express = require('express');
const cors = require('cors');
require('dotenv').config();
const bodyParser = require('body-parser');

const authRoutes = require('./routes/authRoutes');
const packageRoutes = require('./routes/packageRoutes.js');
const bookingRoutes = require('./routes/bookingRoutes.js');
const studentRoutes = require('./routes/studentRoutes.js');
const adminRoutes = require('./routes/adminRoutes.js');
const companyRoutes = require('./routes/companyRoutes.js');
const superAdminRoutes = require('./routes/superAdminRoutes.js');
const teacherRoutes = require('./routes/teacherRoutes.js');

const app = express();

// CORS must be first so preflight OPTIONS requests get headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', packageRoutes);
app.use(bookingRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/teacher', teacherRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
