import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import axios from 'axios';
import session from 'express-session';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';

config();

const port = 5001;
const spotify_client_id = process.env.SPOTIFY_CLIENT_ID;
const spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const mongoURL = process.env.MONGO_URL;

const app = express();
// Trust proxy is crucial for Heroku
app.set('trust proxy', 1);

// Enable CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  })
);

// Use express.json() before session
app.use(express.json());

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoURL,
    collectionName: 'sessions',
    touchAfter: 24 * 3600,
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true,
    domain: process.env.NODE_ENV === 'production' ? 'snipify-production.up.railway.app' : undefined,
    path: '/',
  },
});
app.use(sessionMiddleware);



// Start the server
const server = app.listen(process.env.PORT || port, () => {
  console.log(`Listening at ${process.env.SERVER_URL}`);
  console.log('Server is running!');
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Auth login route
app.get('/auth/login', (req, res) => {
  console.log('Login');
  const scope =
    'streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';

  const state = generateRandomString(16);

  const auth_query_parameters = new URLSearchParams({
    response_type: 'code',
    client_id: spotify_client_id,
    scope: scope,
    redirect_uri: `${process.env.SERVER_URL}/auth/callback`,
    state: state,
  });

  res.redirect('https://accounts.spotify.com/authorize?' + auth_query_parameters.toString());
});

// Auth callback route
app.get('/auth/callback', async (req, res) => {
  console.log('Callback');
  console.log('Session from callback:', req.session);
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Authorization code is missing');
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        code: code,
        redirect_uri: `${process.env.SERVER_URL}/auth/callback`,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${spotify_client_id}:${spotify_client_secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    // Store the tokens in the session
    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    req.session.expires_in = expires_in;
    req.session.cookie.maxAge = expires_in * 1000;

    // Await the completion of the session save operation
    new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session: ', err);
          reject(err); // Reject the promise on error
        } else {
          resolve(); // Resolve the promise on success
        }
      });
    }).then(() => {
      console.log('Session after login: ', req.session);
      res.redirect(`${process.env.CLIENT_URL}`); // Redirect *after* successful save
    }).catch((err) => {
      // Handle the error from session.save()
      res.status(500).send('Error saving session'); // Send error response
    });


  } catch (error) {
    console.error('Error during authentication:', error.response?.data || error.message);
    res.status(500).send('Error during authentication: ' + (error.response?.data?.error_description || error.message));
  }
});

// Get token
app.get('/auth/token', (req, res) => {
  console.log('Session at /auth/token:', req.session);
  if (req.session.access_token) {
    res.json({ access_token: req.session.access_token });
  } else {
    console.log('No access token available');
    res.status(400).json({ error: 'No access token available' });
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  console.log('Logout');
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error logging out');
    }
    res.clearCookie('connect.sid', {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: process.env.NODE_ENV === 'production' ? 'snipify-production.up.railway.app' : undefined,
    });
    res.status(200).send('Logged out successfully');
  });
});

// Helper function
const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Connect to MongoDB
mongoose
  .connect(mongoURL)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });
