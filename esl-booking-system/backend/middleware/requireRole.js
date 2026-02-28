// Usage: router.get('/path', authenticateToken, requireRole('super_admin'), handler)
// Usage: router.get('/path', authenticateToken, requireRole('company_admin', 'super_admin'), handler)
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

module.exports = requireRole;
