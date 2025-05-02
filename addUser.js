import nodemailer from 'nodemailer';
import chromium from 'playwright-chromium';

async function sendFailureEmail(fullName, email) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NOTIFY_EMAIL_USER,
      pass: process.env.NOTIFY_EMAIL_PASS,
    }
  });

  await transporter.sendMail({
    from: `"Spotify Bot" <${process.env.NOTIFY_EMAIL_USER}>`,
    to: 'alex.t.manning@gmail.com',
    subject: '❌ Failed to Add User to Spotify Dev Dashboard',
    text: `The following user could not be found after submission:\n\nFull Name: ${fullName}\nEmail: ${email}`
  });
}



export async function runAddUserScript(fullName, email) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
    chromiumSandbox: false
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://developer.spotify.com');
    await page.click('button:has-text("Log in")');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Email or username"]', process.env.SPOTIFY_USERNAME);
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Password"]', process.env.SPOTIFY_PASSWORD);
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Log In")');
    await page.waitForTimeout(3000);
    await page.goto('https://developer.spotify.com/dashboard/09b8b17d93aa46e386961ecee775447e/users');
    await page.waitForTimeout(1000);
    await page.fill('#name', fullName);
    await page.waitForTimeout(1000);
    await page.fill('#email', email);
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Add user")');
    await page.waitForTimeout(3000);

    const names = await page.$$eval('table[data-encore-id="table"] tbody tr td:nth-child(2) span', spans =>
        spans.map(el => el.textContent.trim())
    );

    const userFound = names.includes(fullName);

    if (!userFound) {
      await sendFailureEmail(fullName, email);
      throw new Error(`User "${fullName}" not found in table.`);
    }

    console.log(`✅ User "${fullName}" successfully found in table.`);

  } catch (err) {
    console.error('Playwright script failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}


