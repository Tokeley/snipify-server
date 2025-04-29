import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import axios from 'axios';
import session from 'express-session';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';

const port = 5001;
config();

const spotify_client_id = process.env.SPOTIFY_CLIENT_ID;
const spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const mongoURL = process.env.MONGO_URL; // MongoDB connection string

const app = express();
app.set('trust proxy', 1);

// Enable CORS for the React frontend (allow cross-origin requests)
app.use(cors({
  origin: `${process.env.CLIENT_URL}`,  // Your React frontend URL
  methods: ['GET', 'POST'],   
  credentials: true,      
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: mongoURL,
    collectionName: 'sessions',
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: process.env.NODE_ENV === 'production' ? 'snipify-production.up.railway.app' : undefined, // <-- ADD THIS
  }
}));

app.listen(process.env.PORT || port, () => {
  console.log(`Listening at ${process.env.SERVER_URL}`);
  console.log('Hello');
});

// Auth login route
app.get('/auth/login', (req, res) => {
    console.log('Login');
    var scope = "streaming \
                 user-read-email \
                 user-read-private \
                 playlist-read-private \
                 playlist-read-collaborative\
                 playlist-modify-public\
                 playlist-modify-private";
  
    var state = generateRandomString(16);
  
    var auth_query_parameters = new URLSearchParams({
      response_type: "code",
      client_id: spotify_client_id,
      scope: scope,
      redirect_uri: `${process.env.SERVER_URL}/auth/callback`,
      state: state
    });
  
    res.redirect('https://accounts.spotify.com/authorize/?' + auth_query_parameters.toString());
});

// Auth callback route
app.get('/auth/callback', async (req, res) => {
  console.log('Callback');
  console.log('Session from callback:', req.session);
  const code = req.query.code;

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
          'Authorization': 'Basic ' + Buffer.from(`${spotify_client_id}:${spotify_client_secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    // Store the access token in the session
    req.session.access_token = response.data.access_token;

    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).send('Error saving session');
      }

      // Redirect after session is saved
      res.redirect(`${process.env.CLIENT_URL}`);
    });
    
    console.log("Session after login: ", req.session);
    res.redirect(`${process.env.CLIENT_URL}`);
  } catch (error) {
    console.error('Error during authentication', error.response?.data || error.message);
    res.status(500).send('Error during authentication');
  }
});

app.get('/auth/token', (req, res) => {
  console.log('Session at /auth/token:', req.session); 
  if (req.session.access_token) {
      res.json({ access_token: req.session.access_token });
  } else {
      console.log('No access token available');
      res.status(400).json({ error: 'No access token available' });
  }
});


// Logout route
app.get('/auth/logout', (req, res) => {
  console.log('Logout');
  req.session.access_token = null; // Clear the access token from the session
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error logging out');
    }
    res.clearCookie('connect.sid', {
      path: '/',
      secure: process.env.NODE_ENV === 'production', 
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    res.status(200).send('Logged out successfully');
  });
});


// Helper function to generate random string for state
var generateRandomString = function (length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};
