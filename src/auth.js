import { AuthorizationCode } from 'simple-oauth2';
import bcrypt from 'bcrypt';
import { pool } from './index.js';
import dotenv from 'dotenv';
dotenv.config();

const oauth2 = new AuthorizationCode({
    client: {
        id: process.env.GOOGLE_CLIENT_ID,
        secret: process.env.GOOGLE_CLIENT_SECRET,
    },
    auth: {
        tokenHost: 'https://www.googleapis.com',
        tokenPath: '/oauth2/v4/token',
        authorizeHost: 'https://accounts.google.com',
        authorizePath: '/o/oauth2/v2/auth'
    },
});

const authorizationUri = oauth2.authorizeURL({
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    scope: 'openid profile email'
});

async function emailExists(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    return rows.length === 1;
}

async function passwordCorrect(email, password) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    const hash = rows[0].password;
    const res = await bcrypt.compare(password, hash);
    return res;
}

/**
*
* @param {http.IncomingMessage} req
* @param {http.ServerResponse} res
* @param {*} next
*/
function authorize(req, res, next) {
    if (req.signedCookies.user) {
        req.user = req.signedCookies.user;
        next();
    } else {
        res.redirect('/login?returnUrl=' + req.url);
    }
}
function injectUser(req, res, next) {
    if (req.signedCookies.user) {
        res.locals.user = req.signedCookies.user;
    }
    next();
}

export { authorize, injectUser, emailExists, passwordCorrect, oauth2, authorizationUri };