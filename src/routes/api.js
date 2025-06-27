import { Router } from 'express';
import cors from 'cors';
import { getUsers } from '../db.js'; // Adjust the import path as necessary

const router = Router();

const API_KEY = process.env.API_KEY || '';

router.use((req, res, next) => {
  const apiKey = req.query.apiKey;
  if (API_KEY !== '' && apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
});

router.use(cors({
  origin: 'http://localhost:5173'
}));

router.get('/', (req, res) => {
  res.json({ message: 'API is working!' });
});

router.get('/users', async (req, res) => {
  const users = await getUsers();
  console.log('users', users);
  const result = users.map(user => ({
    id: user.id,
    username: user.username,
    email: user.email,
    googleId: user.googleId || null // Ensure googleId is null if not present
  }));
  res.json(result);
});
//   res.json([
//     { id: 1, username: 'John Doe', email: 'john@example.com', googleId: '1234567890' },
//     { id: 2, username: 'Jane Smith', email: 'jane@example.com', googleId: null },
//     { id: 3, username: 'Alice Johnson', email: 'alice@example.com', googleId: null }
//   ]);
// });

router.delete('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  // TODO: Here you would typically delete the user from the database
  res.json({ message: `User with ID ${userId} deleted successfully` });
});

export default router;