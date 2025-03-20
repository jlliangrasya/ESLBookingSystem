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
        console.log("Token verified:", decoded);
        req.user = decoded; // Attach user data to request
        next();
    } catch (error) {
        console.log("Invalid token:", error.message);
        return res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = authenticateToken;
