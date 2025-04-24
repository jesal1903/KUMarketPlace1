// server.js
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors({
  origin: [
    "https://kumarketplace1.onrender.com",  // Your frontend hosted URL
    "http://localhost:5500"                 // For local testing
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(helmet());
app.use(bodyParser.json());
app.use('/api/auth/', limiter);

// Database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper function to generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

// Admin verification middleware
const verifyAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        const [users] = await pool.query('SELECT is_admin FROM users WHERE id = ?', [decoded.userId]);
        
        if (users.length === 0 || !users[0].is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Admin verification error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Email configuration
const EMAIL_CONFIG = {
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // use TLS
    auth: {
        user: process.env.EMAIL_USER, // Your Brevo SMTP login
        pass: process.env.EMAIL_PASSWORD // Your Brevo SMTP key
  }
});

// Validation middleware
const validateSignup = [
    body('fullname').trim().notEmpty().withMessage('Full name is required')
        .isLength({ max: 100 }).withMessage('Name too long')
        .escape(),
    body('email').trim().isEmail().withMessage('Valid email required')
        .normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

const validateLogin = [
    body('email').trim().isEmail().withMessage('Valid email required')
        .normalizeEmail(),
    body('password').notEmpty().withMessage('Password required')
];

const validateOrder = [
    body('shipping.name').trim().notEmpty().withMessage('Name is required')
        .isLength({ max: 100 }).withMessage('Name too long')
        .escape(),
    body('shipping.address1').trim().notEmpty().withMessage('Address is required')
        .isLength({ max: 200 }).withMessage('Address too long')
        .escape(),
    body('shipping.address2').optional({ checkFalsy: true }).trim()
        .isLength({ max: 200 }).withMessage('Address too long')
        .escape(),
    body('shipping.city').trim().notEmpty().withMessage('City is required')
        .isLength({ max: 100 }).withMessage('City name too long')
        .escape(),
    body('shipping.state').trim().notEmpty().withMessage('State is required')
        .isLength({ max: 50 }).withMessage('State name too long')
        .escape(),
    body('shipping.zip').trim().notEmpty().withMessage('Zip code is required')
        .isPostalCode('any').withMessage('Invalid zip code'),
    body('shipping.phone').trim().notEmpty().withMessage('Phone is required')
        .isMobilePhone('any').withMessage('Invalid phone number'),
    body('items.*.title').trim().notEmpty().withMessage('Item title required')
        .escape(),
    body('items.*.price').isFloat({ gt: 0 }).withMessage('Invalid price'),
    body('items.*.quantity').optional().isInt({ gt: 0 }).withMessage('Invalid quantity'),
    body('subtotal').isFloat({ gt: 0 }).withMessage('Invalid subtotal'),
    body('tax').isFloat({ min: 0 }).withMessage('Invalid tax amount'),
    body('shippingFee').isFloat({ min: 0 }).withMessage('Invalid shipping fee'),
    body('total').isFloat({ gt: 0 }).withMessage('Invalid total amount')
];

const validateDateSearch = [
    body('date').optional().isISO8601().withMessage('Invalid date format (YYYY-MM-DD)')
];

// SQL injection protection middleware
const sqlInjectionProtection = (req, res, next) => {
    const queryParams = { ...req.query };
    const sqlKeywords = ['select', 'insert', 'update', 'delete', 'drop', 'union', '--'];
    
    for (const param in queryParams) {
        const value = queryParams[param].toLowerCase();
        if (sqlKeywords.some(keyword => value.includes(keyword))) {
            return res.status(400).json({ error: 'Invalid search parameter' });
        }
    }
    
    if (req.body) {
        for (const field in req.body) {
            if (typeof req.body[field] === 'string') {
                const value = req.body[field].toLowerCase();
                if (sqlKeywords.some(keyword => value.includes(keyword))) {
                    return res.status(400).json({ error: 'Invalid input detected' });
                }
            }
        }
    }
    
    next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].replace(/[<>"'`]/g, '');
            }
        }
    }
    next();
};
app.use(sanitizeInput);

// Helper function to send order confirmation email
async function sendOrderEmail(orderDetails) {
    try {
        const itemsList = orderDetails.items.map(item => 
            `<li>${item.quantity}x ${item.title} - $${item.price.toFixed(2)}</li>`
        ).join('');

        const emailHtml = `
            <h2>New Order Notification</h2>
            <p>A new order has been placed on KU Marketplace:</p>
            
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> ${orderDetails.id}</p>
            <p><strong>Date:</strong> ${new Date(orderDetails.date).toLocaleString()}</p>
            <p><strong>Status:</strong> ${orderDetails.status}</p>
            <p><strong>Total:</strong> $${orderDetails.total.toFixed(2)}</p>
            
            <h3>Items Ordered</h3>
            <ul>${itemsList}</ul>
            
            <h3>Shipping Information</h3>
            <p><strong>Name:</strong> ${orderDetails.shipping.name}</p>
            <p><strong>Address:</strong> ${orderDetails.shipping.address1}${orderDetails.shipping.address2 ? ', ' + orderDetails.shipping.address2 : ''}</p>
            <p><strong>City/State/Zip:</strong> ${orderDetails.shipping.city}, ${orderDetails.shipping.state} ${orderDetails.shipping.zip}</p>
            <p><strong>Phone:</strong> ${orderDetails.shipping.phone}</p>
        `;

        await transporter.sendMail({
            from: `"KU Marketplace" <${EMAIL_CONFIG.auth.user}>`,
            to: ADMIN_EMAIL,
            subject: `New Order #${orderDetails.id}`,
            html: emailHtml
        });

        console.log('Order notification email sent to admin');
    } catch (error) {
        console.error('Error sending order email:', error);
    }
}

// Routes
app.post('/api/auth/signup', validateSignup, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { fullname, email, password } = req.body;

        const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ error: 'Email already in use' });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const [result] = await pool.query(
            'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
            [fullname, email, passwordHash]
        );

        const token = generateToken(result.insertId);

        res.status(201).json({ 
            message: 'User created successfully', 
            token,
            user: {
                id: result.insertId,
                full_name: fullname,
                email
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', validateLogin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, password } = req.body;

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user.id);

        res.json({ 
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.query('SELECT id, full_name, email FROM users WHERE id = ?', [decoded.userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });

    } catch (error) {
        console.error('Auth error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders', validateOrder, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;

        const [orderResult] = await pool.query(
            'INSERT INTO orders (user_id, shipping_name, shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_zip, shipping_phone, subtotal, tax, shipping_fee, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                userId,
                req.body.shipping.name,
                req.body.shipping.address1,
                req.body.shipping.address2 || '',
                req.body.shipping.city,
                req.body.shipping.state,
                req.body.shipping.zip,
                req.body.shipping.phone,
                req.body.subtotal,
                req.body.tax,
                req.body.shippingFee,
                req.body.total
            ]
        );

        const orderId = orderResult.insertId;
        for (const item of req.body.items) {
            const price = typeof item.price === 'number' ? item.price : parseFloat(item.price);
            await pool.query(
                'INSERT INTO order_items (order_id, product_title, product_price, product_image, quantity) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.title, price, item.image, item.quantity || 1]
            );
        }

        const [orders] = await pool.query(
            'SELECT o.*, oi.id as item_id, oi.product_title, oi.product_price, oi.product_image, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.id = ?',
            [orderId]
        );

        const order = {
            id: orderId,
            date: orders[0].order_date,
            status: orders[0].status,
            shipping: {
              name: orders[0].shipping_name,
              address1: orders[0].shipping_address1,
              address2: orders[0].shipping_address2,
              city: orders[0].shipping_city,
              state: orders[0].shipping_state,
              zip: orders[0].shipping_zip,
              phone: orders[0].shipping_phone
            },
            subtotal: parseFloat(orders[0].subtotal),
            tax: parseFloat(orders[0].tax),
            shippingFee: parseFloat(orders[0].shipping_fee),
            total: parseFloat(orders[0].total),
            items: orders.map(row => ({
              id: row.item_id,
              title: row.product_title,
              price: parseFloat(row.product_price),
              image: row.product_image,
              quantity: row.quantity
            }))
        };

        await sendOrderEmail(order);
        res.status(201).json(order);
    } catch (error) {
        console.error('Order creation error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;

        const [orders] = await pool.query(
            'SELECT id, order_date, status, total, shipping_name, shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_zip FROM orders WHERE user_id = ? ORDER BY order_date DESC',
            [userId]
        );

        for (const order of orders) {
            const [items] = await pool.query(
                'SELECT product_title, product_price, product_image, quantity FROM order_items WHERE order_id = ?',
                [order.id]
            );
            order.items = items;
            
            order.shipping = {
                name: order.shipping_name,
                address1: order.shipping_address1,
                address2: order.shipping_address2,
                city: order.shipping_city,
                state: order.shipping_state,
                zip: order.shipping_zip
            };
        }

        res.json(orders);
    } catch (error) {
        console.error('Get orders error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const orderId = req.params.id;

        const [orders] = await pool.query(
            'SELECT o.*, oi.id as item_id, oi.product_title, oi.product_price, oi.product_image, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.id = ? AND o.user_id = ?',
            [orderId, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = {
            id: orders[0].id,
            date: orders[0].order_date,
            status: orders[0].status,
            shipping: {
                name: orders[0].shipping_name,
                address1: orders[0].shipping_address1,
                address2: orders[0].shipping_address2,
                city: orders[0].shipping_city,
                state: orders[0].shipping_state,
                zip: orders[0].shipping_zip,
                phone: orders[0].shipping_phone
            },
            subtotal: orders[0].subtotal,
            tax: orders[0].tax,
            shippingFee: orders[0].shipping_fee,
            total: orders[0].total,
            items: orders.map(row => ({
                id: row.item_id,
                title: row.product_title,
                price: row.product_price,
                image: row.product_image,
                quantity: row.quantity
            }))
        };

        res.json(order);
    } catch (error) {
        console.error('Get order error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin endpoints
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, full_name, email, created_at FROM users ORDER BY created_at DESC'
        );
        
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/orders', verifyAdmin, async (req, res) => {
    try {
        const [orders] = await pool.query(
            'SELECT o.*, u.email as user_email FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.order_date DESC'
        );
        
        res.json(orders);
    } catch (error) {
        console.error('Admin get orders error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/orders/search', verifyAdmin, sqlInjectionProtection, validateDateSearch, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { date, phone } = req.query;
        
        if (!date && !phone) {
            return res.status(400).json({ error: 'Please provide date or phone number to search' });
        }

        let query = `
            SELECT o.*, u.email as user_email 
            FROM orders o 
            JOIN users u ON o.user_id = u.id 
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ' AND DATE(o.order_date) = ?';
            params.push(date);
        }

        if (phone) {
            query += ' AND o.shipping_phone LIKE ?';
            params.push(`%${phone}%`);
        }

        query += ' ORDER BY o.order_date DESC';

        const [orders] = await pool.query(query, params);
        
        res.json(orders);
    } catch (error) {
        console.error('Search orders error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/admin/orders/:id', verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, req.params.id]
        );
        
        res.json({ message: 'Order status updated' });
    } catch (error) {
        console.error('Admin update order error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const orderId = req.params.id;

        // First verify the order belongs to the user
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [orderId, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Only allow cancellation if status is 'processing'
        if (orders[0].status !== 'processing') {
            return res.status(400).json({ error: 'Order cannot be cancelled at this stage' });
        }

        // Update the order status to 'cancelled'
        await pool.query(
            'UPDATE orders SET status = ? WHERE id = ?',
            ['cancelled', orderId]
        );

        res.json({ message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Cancel order error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
