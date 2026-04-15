const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');

// GET / — Fetch announcements for the current user based on role/audience
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { role, company_id: companyId, id: userId } = req.user;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        let whereClause = '';
        const params = [];

        if (role === 'super_admin') {
            whereClause = 'WHERE a.company_id IS NULL';
        } else if (role === 'company_admin') {
            whereClause = 'WHERE ((a.company_id IS NULL AND a.audience = ?) OR a.company_id = ?)';
            params.push('company_admin', companyId);
        } else if (role === 'teacher') {
            whereClause = 'WHERE a.company_id = ? AND a.audience IN (?, ?)';
            params.push(companyId, 'teachers', 'all');
        } else if (role === 'student') {
            whereClause = 'WHERE a.company_id = ? AND a.audience IN (?, ?)';
            params.push(companyId, 'students', 'all');
        } else {
            return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
        }

        // Filter out expired announcements
        whereClause += ' AND (a.expires_at IS NULL OR a.expires_at > NOW())';

        // Count total
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM announcements a ${whereClause}`,
            params
        );

        // Fetch with read status
        const [rows] = await pool.query(
            `SELECT a.*, u.name AS author_name,
                    IF(ar.id IS NOT NULL, TRUE, FALSE) AS is_read
             FROM announcements a
             JOIN users u ON a.author_id = u.id
             LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
             ${whereClause}
             ORDER BY a.is_pinned DESC, a.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, ...params, limit, offset]
        );

        res.json({
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Fetch announcements error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST / — Create announcement
router.post('/', authenticateToken, requireRole('company_admin', 'super_admin'), async (req, res) => {
    try {
        const { title, content, audience, is_pinned, expires_at } = req.body;
        const { role, company_id: companyId, id: userId } = req.user;

        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required' });
        }

        // Super admin can only broadcast to company_admin
        let announcementCompanyId = null;
        let announcementAudience = 'company_admin';

        if (role === 'company_admin') {
            announcementCompanyId = companyId;
            const validAudiences = ['teachers', 'students', 'all'];
            announcementAudience = validAudiences.includes(audience) ? audience : 'all';
        }

        const [result] = await pool.query(
            `INSERT INTO announcements (company_id, author_id, title, content, audience, is_pinned, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [announcementCompanyId, userId, title, content, announcementAudience,
             is_pinned ? 1 : 0, expires_at || null]
        );

        const [[announcement]] = await pool.query('SELECT * FROM announcements WHERE id = ?', [result.insertId]);

        // Notify target users
        if (role === 'super_admin') {
            // Notify all company admins
            const [admins] = await pool.query(
                "SELECT id FROM users WHERE role = 'company_admin' AND is_active = TRUE"
            );
            Promise.all(admins.map(admin => notify({
                userId: admin.id,
                companyId: null,
                type: 'announcement',
                title: `Announcement: ${title}`,
                message: content.substring(0, 200),
            }))).catch(() => {});
        } else {
            // Notify target users in the company
            let roleFilter = '';
            if (announcementAudience === 'teachers') {
                roleFilter = "AND role = 'teacher'";
            } else if (announcementAudience === 'students') {
                roleFilter = "AND role = 'student'";
            } else {
                roleFilter = "AND role IN ('teacher', 'student')";
            }

            const [targets] = await pool.query(
                `SELECT id FROM users WHERE company_id = ? AND is_active = TRUE ${roleFilter}`,
                [companyId]
            );
            Promise.all(targets.map(u => notify({
                userId: u.id,
                companyId,
                type: 'announcement',
                title: `Announcement: ${title}`,
                message: content.substring(0, 200),
            }))).catch(() => {});
        }

        logAction(announcementCompanyId, userId, 'create_announcement', 'announcement', result.insertId, { title, audience: announcementAudience });

        res.status(201).json({ message: 'Announcement created', announcement });
    } catch (err) {
        console.error('Create announcement error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /:id — Edit announcement (author only)
router.put('/:id', authenticateToken, requireRole('company_admin', 'super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, audience, is_pinned, expires_at } = req.body;
        const { role, company_id: companyId, id: userId } = req.user;

        const [[existing]] = await pool.query('SELECT * FROM announcements WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ message: 'Announcement not found' });

        // Verify ownership
        if (role === 'company_admin' && existing.company_id !== companyId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (existing.author_id !== userId) {
            return res.status(403).json({ message: 'Only the author can edit this announcement' });
        }

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (is_pinned !== undefined) updates.is_pinned = is_pinned ? 1 : 0;
        if (expires_at !== undefined) updates.expires_at = expires_at || null;

        if (role === 'company_admin' && audience !== undefined) {
            const validAudiences = ['teachers', 'students', 'all'];
            if (validAudiences.includes(audience)) updates.audience = audience;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        await pool.query(`UPDATE announcements SET ${setClauses} WHERE id = ?`, [...values, id]);

        const [[updated]] = await pool.query('SELECT * FROM announcements WHERE id = ?', [id]);
        logAction(existing.company_id, userId, 'update_announcement', 'announcement', id, { title: updated.title });

        res.json({ message: 'Announcement updated', announcement: updated });
    } catch (err) {
        console.error('Update announcement error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /:id — Delete announcement
router.delete('/:id', authenticateToken, requireRole('company_admin', 'super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { role, company_id: companyId, id: userId } = req.user;

        const [[existing]] = await pool.query('SELECT * FROM announcements WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ message: 'Announcement not found' });

        if (role === 'company_admin' && existing.company_id !== companyId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (existing.author_id !== userId) {
            return res.status(403).json({ message: 'Only the author can delete this announcement' });
        }

        await pool.query('DELETE FROM announcements WHERE id = ?', [id]);
        logAction(existing.company_id, userId, 'delete_announcement', 'announcement', id, { title: existing.title });

        res.json({ message: 'Announcement deleted' });
    } catch (err) {
        console.error('Delete announcement error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /:id/read — Mark announcement as read
router.post('/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await pool.query(
            'INSERT IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)',
            [id, userId]
        );

        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
