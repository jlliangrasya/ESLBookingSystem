const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');

// POST / — Teacher creates assignment
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { student_id, booking_id, title, instructions, due_date, max_score, resource_links } = req.body;
        const companyId = req.user.company_id;
        const teacherId = req.user.id;

        if (!student_id || !title || !instructions || !due_date) {
            return res.status(400).json({ message: 'student_id, title, instructions, and due_date are required' });
        }

        // Verify student belongs to same company
        const [[student]] = await pool.query(
            "SELECT id, name FROM users WHERE id = ? AND company_id = ? AND role = 'student' AND is_active = TRUE",
            [student_id, companyId]
        );
        if (!student) return res.status(404).json({ message: 'Student not found in your company' });

        const [result] = await pool.query(
            `INSERT INTO assignments (company_id, teacher_id, student_id, booking_id, title, instructions, due_date, max_score, resource_links)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, teacherId, student_id, booking_id || null, title, instructions, due_date,
             max_score || null, resource_links ? JSON.stringify(resource_links) : null]
        );

        notify({
            userId: student_id, companyId,
            type: 'new_assignment',
            title: 'New Assignment',
            message: `You have a new assignment: "${title}". Due: ${new Date(due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
        });

        logAction(companyId, teacherId, 'create_assignment', 'assignment', result.insertId, { title, student_id });

        res.status(201).json({ message: 'Assignment created', assignment_id: result.insertId });
    } catch (err) {
        console.error('Create assignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /teacher — List teacher's assignments
router.get('/teacher', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;

        const [rows] = await pool.query(
            `SELECT a.*, u.name AS student_name,
                    (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count,
                    (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.score IS NOT NULL) AS graded_count
             FROM assignments a
             JOIN users u ON a.student_id = u.id
             WHERE a.teacher_id = ? AND a.company_id = ?
             ORDER BY a.created_at DESC`,
            [teacherId, companyId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fetch teacher assignments error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /student — List student's assignments
router.get('/student', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const studentId = req.user.id;
        const companyId = req.user.company_id;

        const [rows] = await pool.query(
            `SELECT a.*, u.name AS teacher_name,
                    s.id AS submission_id, s.submitted_at, s.is_late, s.score, s.feedback, s.graded_at
             FROM assignments a
             JOIN users u ON a.teacher_id = u.id
             LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
             WHERE a.student_id = ? AND a.company_id = ?
             ORDER BY a.due_date ASC`,
            [studentId, studentId, companyId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fetch student assignments error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /admin — List all company assignments
router.get('/admin', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;

        const [rows] = await pool.query(
            `SELECT a.*, t.name AS teacher_name, s.name AS student_name,
                    (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) AS submission_count
             FROM assignments a
             JOIN users t ON a.teacher_id = t.id
             JOIN users s ON a.student_id = s.id
             WHERE a.company_id = ?
             ORDER BY a.created_at DESC`,
            [companyId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fetch admin assignments error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /:id — Assignment detail
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { role, company_id: companyId, id: userId } = req.user;

        const [[assignment]] = await pool.query(
            `SELECT a.*, t.name AS teacher_name, s.name AS student_name
             FROM assignments a
             JOIN users t ON a.teacher_id = t.id
             JOIN users s ON a.student_id = s.id
             WHERE a.id = ?`,
            [id]
        );
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

        // Verify access
        if (role === 'teacher' && assignment.teacher_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (role === 'student' && assignment.student_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (role === 'company_admin' && assignment.company_id !== companyId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Include submission if exists
        const [[submission]] = await pool.query(
            'SELECT * FROM assignment_submissions WHERE assignment_id = ?',
            [id]
        );

        res.json({ ...assignment, submission: submission || null });
    } catch (err) {
        console.error('Fetch assignment detail error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /:id — Update assignment (teacher only, before submissions)
router.put('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;

        const [[assignment]] = await pool.query('SELECT * FROM assignments WHERE id = ? AND teacher_id = ?', [id, teacherId]);
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

        // Check if any submissions exist
        const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM assignment_submissions WHERE assignment_id = ?', [id]);
        if (cnt > 0) return res.status(400).json({ message: 'Cannot edit assignment after students have submitted' });

        const { title, instructions, due_date, max_score, resource_links, status } = req.body;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (instructions !== undefined) updates.instructions = instructions;
        if (due_date !== undefined) updates.due_date = due_date;
        if (max_score !== undefined) updates.max_score = max_score;
        if (resource_links !== undefined) updates.resource_links = JSON.stringify(resource_links);
        if (status !== undefined && ['active', 'closed'].includes(status)) updates.status = status;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        await pool.query(`UPDATE assignments SET ${setClauses} WHERE id = ?`, [...Object.values(updates), id]);

        res.json({ message: 'Assignment updated' });
    } catch (err) {
        console.error('Update assignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /:id — Delete assignment (teacher only)
router.delete('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;

        const [result] = await pool.query('DELETE FROM assignments WHERE id = ? AND teacher_id = ?', [id, teacherId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Assignment not found' });

        res.json({ message: 'Assignment deleted' });
    } catch (err) {
        console.error('Delete assignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /:id/submit — Student submits response
router.post('/:id/submit', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = req.user.id;
        const companyId = req.user.company_id;
        const { response_text, reference_links } = req.body;

        if (!response_text || !response_text.trim()) {
            return res.status(400).json({ message: 'Response text is required' });
        }

        const [[assignment]] = await pool.query(
            'SELECT * FROM assignments WHERE id = ? AND student_id = ? AND company_id = ?',
            [id, studentId, companyId]
        );
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
        if (assignment.status !== 'active') return res.status(400).json({ message: 'This assignment is closed' });

        // Auto-detect late submission
        const isLate = new Date() > new Date(assignment.due_date) ? 1 : 0;

        // Upsert: allow resubmission
        await pool.query(
            `INSERT INTO assignment_submissions (assignment_id, student_id, response_text, reference_links, is_late)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                response_text = VALUES(response_text),
                reference_links = VALUES(reference_links),
                is_late = VALUES(is_late),
                submitted_at = NOW()`,
            [id, studentId, response_text, reference_links ? JSON.stringify(reference_links) : null, isLate]
        );

        notify({
            userId: assignment.teacher_id, companyId,
            type: 'submission_received',
            title: 'Assignment Submitted',
            message: `A student submitted "${assignment.title}"${isLate ? ' (late)' : ''}.`,
        });

        res.json({ message: 'Submission saved', is_late: !!isLate });
    } catch (err) {
        console.error('Submit assignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /:id/grade — Teacher grades submission
router.post('/:id/grade', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { score, feedback } = req.body;

        if (score === undefined || score === null) {
            return res.status(400).json({ message: 'Score is required' });
        }

        const [[assignment]] = await pool.query(
            'SELECT * FROM assignments WHERE id = ? AND teacher_id = ?',
            [id, teacherId]
        );
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

        // Validate score against max_score
        if (assignment.max_score !== null && score > assignment.max_score) {
            return res.status(400).json({ message: `Score cannot exceed max score of ${assignment.max_score}` });
        }

        const [result] = await pool.query(
            `UPDATE assignment_submissions SET score = ?, feedback = ?, graded_at = NOW(), graded_by = ?
             WHERE assignment_id = ? AND student_id = ?`,
            [score, feedback || null, teacherId, id, assignment.student_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No submission found to grade' });
        }

        notify({
            userId: assignment.student_id, companyId,
            type: 'grade_released',
            title: 'Assignment Graded',
            message: `Your assignment "${assignment.title}" has been graded. Score: ${score}${assignment.max_score ? `/${assignment.max_score}` : ''}.`,
        });

        res.json({ message: 'Submission graded' });
    } catch (err) {
        console.error('Grade assignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
