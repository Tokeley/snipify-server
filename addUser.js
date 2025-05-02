import nodemailer from 'nodemailer';
import {chromium} from 'playwright-chromium';

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
    headless: true,
    slowMo: 100,
    chromiumSandbox: false
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://developer.spotify.com');
    await page.click('button:has-text("Log in")');
    await page.waitForTimeout(3000);
    await page.fill('input[placeholder="Email or username"]', process.env.SPOTIFY_USERNAME);

    console.log('Waiting for password field to appear...');
    const passwordField = await page.waitForSelector('input[placeholder="Password"]', { timeout: 10000 }).catch(() => null);

    if (passwordField) {
      console.log('Password field appeared, filling in...');
      await page.fill('input[placeholder="Password"]', process.env.SPOTIFY_PASSWORD);
      await page.waitForTimeout(3000);
      await page.click('button:has-text("Log In")');
    } else {
      await page.waitForTimeout(1000);
      console.log('Clicking the Continue button...');
      await page.click('button[data-testid="login-button"]');

      console.log('Waiting for "Log in with a password" button...');
      await page.waitForSelector('button:has-text("Log in with a password")', { timeout: 10000 });
      await page.click('button:has-text("Log in with a password")');
      
      console.log('Waiting for password field...');
      await page.waitForSelector('input[placeholder="Password"]', { visible: true, timeout: 10000 });
      await page.fill('input[placeholder="Password"]', process.env.SPOTIFY_PASSWORD);
      await page.waitForTimeout(3000);
      await page.click('button:has-text("Log In")');
    }

    await page.waitForTimeout(4000);
    await page.goto('https://developer.spotify.com/dashboard/09b8b17d93aa46e386961ecee775447e/users');

    // Wait for the full name input field to be visible and fill it
    console.log('Waiting for #name field to appear...');
    await page.waitForSelector('#name', { visible: true, timeout: 60000 });
    console.log('Filling in #name field...');
    await page.fill('#name', fullName);

    // Wait for the email input field to be visible and fill it
    console.log('Waiting for #email field to appear...');
    await page.waitForSelector('#email', { visible: true, timeout: 60000 });
    console.log('Filling in #email field...');
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



