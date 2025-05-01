import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import axios from 'axios';
import querystring from 'querystring';
import crypto from 'crypto';
import { runAddUserScript } from './addUser.js';

config();

const app = express();
const port = process.env.PORT || 5001;

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = `${process.env.SERVER_URL}/auth/callback`;

const generateRandomString = (length) => {
  return crypto.randomBytes(60).toString('hex').slice(0, length);
};

app.use(cors({
  origin: process.env.CLIENT_URL,
  methods: ['GET', 'POST'],
}));

app.use(express.json());

// Spotify login
app.get('/auth/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';

  const auth_query_parameters = querystring.stringify({
    response_type: 'code',
    client_id: client_id,
    scope: scope,
    redirect_uri: redirect_uri,
    state: state
  });

  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_parameters}`);
});

// Spotify callback
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.status(400).send('Authorization code is missing');
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code',
      }),
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    // Redirect to client with tokens in URL
    res.redirect(`${process.env.CLIENT_URL}/#${querystring.stringify({
      access_token,
      refresh_token,
    })}`);
  } catch (error) {
    console.error('Error during token exchange:', error.response?.data || error.message);
    res.status(500).send('Failed to get access token');
  }
});

// Optional: Refresh token endpoint
app.get('/auth/refresh_token', async (req, res) => {
  const refresh_token = req.query.refresh_token;

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
      }),
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    res.send({
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || refresh_token,
    });
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    res.status(500).send('Failed to refresh token');
  }
});

// Add user endpoint
app.post('/add-user', async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    return res.status(400).json({ success: false, message: 'Missing fullName or email in request body.' });
  }

  try {
    await runAddUserScript(fullName, email);
    res.status(200).json({ success: true, message: 'User added via Playwright script.' });
  } catch (error) {
    console.error('Playwright script failed:', error);
    res.status(500).json({ success: false, message: 'Script failed to run.' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Listening on ${process.env.SERVER_URL}`);
});
