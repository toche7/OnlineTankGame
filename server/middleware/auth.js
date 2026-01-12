const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../database');

function setupAuth() {
  // Passport Google Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback',
      },
      function (accessToken, refreshToken, profile, done) {
        (async () => {
          try {
            let user = await db.getPlayerByGoogleId(profile.id);
            if (!user) {
              // Create new user
              const playerId =
                'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              user = {
                id: playerId,
                google_id: profile.id,
                username: profile.displayName,
                email: profile.emails[0].value,
                stats: {
                  gamesPlayed: 0,
                  wins: 0,
                  kills: 0,
                  deaths: 0,
                  totalScore: 0,
                  highestKills: 0,
                  lastPlayed: Date.now(),
                },
              };
              await db.createPlayer(user);
            }
            return done(null, user);
          } catch (err) {
            return done(err, null);
          }
        })();
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await db.getPlayer(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
}

module.exports = { setupAuth };
