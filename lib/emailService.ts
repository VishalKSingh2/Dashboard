import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email using nodemailer
 * Configure your SMTP settings in environment variables
 */
export async function sendEmail({ to, subject, html }: EmailOptions) {
  try {
    // Create transporter - using Gmail for demo
    // For production, use proper SMTP service
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });

    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    // For demo purposes, log instead of failing
    console.log('Email would have been sent to:', to);
    console.log('Subject:', subject);
    return false;
  }
}

/**
 * Send report ready email
 */
export async function sendReportReadyEmail(
  email: string,
  downloadUrl: string,
  startDate: string,
  endDate: string,
  recordCount: number,
  fileSize: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const fullDownloadUrl = `${baseUrl}${downloadUrl}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #ffffff;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          color: #7c3aed;
          margin: 0;
          font-size: 24px;
        }
        .content {
          margin-bottom: 30px;
        }
        .info-box {
          background: #f3f4f6;
          border-left: 4px solid #7c3aed;
          padding: 15px;
          margin: 20px 0;
        }
        .info-box strong {
          color: #7c3aed;
        }
        .download-button {
          display: inline-block;
          background: #7c3aed;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          text-align: center;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
        .warning {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Your Advanced Report is Ready!</h1>
        </div>
        
        <div class="content">
          <p>Hello,</p>
          
          <p>Great news! Your advanced analytics report has been successfully generated and is ready for download.</p>
          
          <div class="info-box">
            <p><strong>Report Details:</strong></p>
            <ul style="margin: 10px 0;">
              <li><strong>Date Range:</strong> ${startDate} to ${endDate}</li>
              <li><strong>Total Records:</strong> ${recordCount.toLocaleString()}</li>
              <li><strong>File Size:</strong> ${fileSize}</li>
              <li><strong>Format:</strong> Excel (.xlsx)</li>
            </ul>
          </div>

          <div class="button-container">
            <a href="${fullDownloadUrl}" class="download-button">
              ⬇️ Download Report
            </a>
          </div>

          <div class="warning">
            <p style="margin: 0;"><strong>⚠️ Important:</strong> This download link will expire in 24 hours. Please download your report soon.</p>
          </div>

          <p><strong>What's included in your report:</strong></p>
          <ul>
            <li>Videos - Complete video statistics and metadata</li>
            <li>Transcriptions - All transcription requests and status</li>
            <li>Showreels - Project statistics and details</li>
            <li>Redaction Requests - Redaction tracking information</li>
          </ul>

          <p>If you have any questions or need assistance, please don't hesitate to reach out.</p>
          
          <p>Best regards,<br>
          <strong>Analytics Dashboard Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This is an automated email. Please do not reply to this message.</p>
          <p>© ${new Date().getFullYear()} Report Analytics Dashboard. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '📊 Your Advanced Report is Ready - Download Now',
    html,
  });
}

/**
 * Send report failed email
 */
export async function sendReportFailedEmail(
  email: string,
  startDate: string,
  endDate: string,
  errorMessage: string
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #ffffff;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          color: #dc2626;
          margin: 0;
          font-size: 24px;
        }
        .error-box {
          background: #fee2e2;
          border-left: 4px solid #dc2626;
          padding: 15px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>❌ Report Generation Failed</h1>
        </div>
        
        <div class="content">
          <p>Hello,</p>
          
          <p>We're sorry, but there was an error generating your advanced report.</p>
          
          <div class="error-box">
            <p><strong>Report Details:</strong></p>
            <ul style="margin: 10px 0;">
              <li><strong>Date Range:</strong> ${startDate} to ${endDate}</li>
              <li><strong>Error:</strong> ${errorMessage}</li>
            </ul>
          </div>

          <p><strong>What you can do:</strong></p>
          <ul>
            <li>Try generating the report again with a smaller date range</li>
            <li>Check that the dates are valid</li>
            <li>Contact support if the problem persists</li>
          </ul>
          
          <p>We apologize for any inconvenience.</p>
          
          <p>Best regards,<br>
          <strong>Analytics Dashboard Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This is an automated email. Please do not reply to this message.</p>
          <p>© ${new Date().getFullYear()} Report Analytics Dashboard. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '❌ Report Generation Failed',
    html,
  });
}
