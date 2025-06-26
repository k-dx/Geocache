import { Router } from 'express';
import cors from 'cors';

const router = Router();

router.use(cors());

router.get('/', (req, res) => {
  res.json({ message: 'API is working!' });
});

router.get('/users', (req, res) => {
  res.json([
    { id: 1, username: 'John Doe', email: 'john@example.com', googleId: '1234567890' },
    { id: 2, username: 'Jane Smith', email: 'jane@example.com', googleId: null },
    { id: 3, username: 'Alice Johnson', email: 'alice@example.com', googleId: null }
  ]);
});

router.delete('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  // TODO: Here you would typically delete the user from the database
  res.json({ message: `User with ID ${userId} deleted successfully` });
});

export default router;