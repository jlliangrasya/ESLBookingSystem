-- Migration: Bulk import logs table
-- Run this migration against your database before deploying

CREATE TABLE IF NOT EXISTS bulk_import_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    imported_by INT NOT NULL,
    import_type ENUM('teachers','students') NOT NULL,
    total_rows INT NOT NULL DEFAULT 0,
    success_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    error_details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (imported_by) REFERENCES users(id),
    INDEX idx_bil_company (company_id, created_at)
);
