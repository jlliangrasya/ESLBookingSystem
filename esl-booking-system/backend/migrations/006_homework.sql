-- Migration: Homework/Assignment system tables
-- Run this migration against your database before deploying

CREATE TABLE IF NOT EXISTS assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    teacher_id INT NOT NULL,
    student_id INT NOT NULL,
    booking_id INT DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    instructions TEXT NOT NULL,
    due_date DATETIME NOT NULL,
    max_score INT DEFAULT NULL,
    resource_links JSON NULL,
    status ENUM('active','closed') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    INDEX idx_assign_teacher (company_id, teacher_id),
    INDEX idx_assign_student (student_id, status),
    INDEX idx_assign_due (due_date)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    response_text TEXT NOT NULL,
    reference_links JSON NULL,
    is_late TINYINT(1) DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score INT DEFAULT NULL,
    feedback TEXT DEFAULT NULL,
    graded_at TIMESTAMP NULL DEFAULT NULL,
    graded_by INT DEFAULT NULL,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (graded_by) REFERENCES users(id),
    UNIQUE KEY uq_submission (assignment_id, student_id)
);
