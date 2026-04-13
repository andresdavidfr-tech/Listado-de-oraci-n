import express from 'express';
import { createServer as createViteServer } from 'vite';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('Firebase Admin initialized.');
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT is not set. Email cron job will not be able to read users.');
  }
} catch (e) {
  console.error('Failed to initialize Firebase Admin:', e);
}

// Initialize Nodemailer
let transporter: nodemailer.Transporter | null = null;
async function setupMailer() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('SMTP mailer initialized.');
  } else {
    console.warn('SMTP credentials not provided. Using Ethereal Email for testing.');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('Ethereal mailer initialized. Check console for message URLs.');
    } catch (e) {
      console.error('Failed to initialize Ethereal mailer:', e);
    }
  }
}
setupMailer();

// Cron Job: Runs every minute
cron.schedule('* * * * *', async () => {
  if (!db || !transporter) return;

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;
  const currentDay = now.getDay();

  try {
    const usersSnapshot = await db.collection('users').get();
    usersSnapshot.forEach(async (doc) => {
      const userData = doc.data();
      const settings = userData.settings;
      const email = userData.email;

      if (settings && settings.notificationsEnabled && email) {
        const reminderTime = settings.reminderTime || '08:00';
        const frequency = settings.reminderFrequency || 'daily';
        const days = settings.reminderDays || [0, 1, 2, 3, 4, 5, 6];

        if (currentTime === reminderTime) {
          if (frequency === 'daily' || (frequency === 'weekly' && days.includes(currentDay))) {
            // Send Email
            try {
              const info = await transporter!.sendMail({
                from: '"Diario de Oración" <noreply@diariodeoracion.app>',
                to: email,
                subject: '🙏 ¡Es tiempo de orar!',
                text: 'Perseverad en la oración, velando en ella con acción de gracias. Abre tu Diario de Oración para ver tus motivos de hoy.',
                html: '<p><strong>Perseverad en la oración, velando en ella con acción de gracias.</strong></p><p>Abre tu Diario de Oración para ver tus motivos de hoy.</p>'
              });
              console.log(`Email sent to ${email}: ${info.messageId}`);
              if (info.messageId && info.messageId.includes('ethereal')) {
                console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
              }
            } catch (err) {
              console.error(`Failed to send email to ${email}:`, err);
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Error in cron job:', err);
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
