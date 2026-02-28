const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        console.log("No authorization header found");
        return res.status(403).json({ message: "Access denied, token missing" });
    }

    const token = authHeader.split(" ")[1]; // Extract token from "Bearer <token>"
    if (!token) {
        console.log("Token is missing from Authorization header");
        return res.status(403).json({ message: "Access denied, token missing" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // decoded now contains: { id, role, company_id }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = authenticateToken;

