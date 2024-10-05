const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Bull = require('bull');
const { createTransport } = require('nodemailer');
require('dotenv').config(); // To load environment variables from .env file

const app = express();
app.use(bodyParser.json()); // For parsing application/json

// Hardcoded API Key (in production, use environment variables or a more secure method)
const API_KEY = '6c60151c-9b97-4579-8309-71f5f127d8cc-AV-INSPEC';

// Allowed domains for CORS
const allowedDomains = ['https://www.av-inspec.com', 'http://localhost:3000'];

// CORS middleware configuration
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl requests)
        if (!origin) return callback(null, true);

        if (allowedDomains.indexOf(origin) === -1) {
            // If the origin is not in the allowedDomains list, reject the request
            return callback(new Error('Not allowed by CORS'), false);
        }
        // Allow the request if the origin is in the allowedDomains list
        return callback(null, true);
    }
}));

// Initialize Redis connection for Bull queue
const emailQueue = new Bull('email-queue', {
  redis: {
    host: process.env.REDIS_HOST, // or your Redis host
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});


if (!global.transporter) {
    global.transporter = createTransport({
        port: 465, //465 or 587
        host: process.env.SMTP_HOST,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        secure: true, //true for secure
    });
}

emailQueue.process(async (job) => {
  const { email, subject, message,replyTo } = job.data;
  await sendMail(email, subject, message,replyTo);
  console.log(`Email sent to ${email}`);
});

// Function to send email
async function sendMail(mailTo, subject, message, replyTo="cs3@absoluteveritas.com") {
    const mailFrom = process.env.SMTP_USER || "info@av-inspec.com";
    const mailData = {
        from: `"Av-Inspec" <${mailFrom}>`,
        to: mailTo,
        subject,
        text: "Sent from: " + mailFrom,
        html: `<div>${message}</div><p>Sent from: ${mailFrom}</p>`,
         replyTo: replyTo
    };
    return await global.transporter.sendMail(mailData);
}

// Middleware to check API Key
const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid API key' });
    }

    next(); // Proceed to the next middleware or route handler
};

// API Endpoint to send emails (protected by the API Key middleware)
app.post('/send-emails', apiKeyMiddleware, async (req, res) => {
    const { emails, message, subject } = req.body;
    console.log("emails:", emails)
    console.log("emails:", message)
    console.log("subject:", subject)

    // Check if emails, subject, and message are provided
    if (!emails || !message || !subject || !Array.isArray(emails)) {
        return res.status(400).send({ error: 'Emails, subject, and message are required!' });
    }

    try {
        // Send email to each recipient
        for (const email of emails) {
            await emailQueue.add({ email, subject, message,replyTo });
        }

        res.status(200).send({ success: true, message: 'Emails sent successfully!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).send({ error: 'Error sending email' });
    }
});

// Start the server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
