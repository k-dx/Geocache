import { Router } from 'express';
import cors from 'cors';
import { 
  deleteUser,
  getRoutes,
  deleteRoute,
  getUsers,
  getUserCount,
  getWaypointCount,
  getRouteCount,
  getCompletedRouteCount,
  getVisitedWaypointCount
 } from '../db.js'; // Adjust the import path as necessary

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
    googleId: user.googleId ?? '-' // Ensure googleId is null if not present
  }));
  res.json(result);
});

router.delete('/users/:id', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  try {
    await deleteUser(userId);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
  res.json({ message: `User with ID ${userId} deleted successfully` });
});

router.get('/routes', async (req, res) => {
  const routes = await getRoutes();
  const result = routes.map(route => ({
    id: route.id,
    name: route.name,
    owner_id: route.owner_id,
    thumbnail: route.thumbnail ?? '-',
  }));
  res.json(result);
});

router.delete('/route/:id', async (req, res) => {
  const routeId = parseInt(req.params.id, 10);
  if (isNaN(routeId)) {
    return res.status(400).json({ error: 'Invalid route ID' });
  }
  try {
    await deleteRoute(routeId)
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete route' });
  }
  res.json({ message: `Route with ID ${routeId} deleted successfully` });
});

router.get('/routes/count', async (req, res) => {
  const count = await getRouteCount();
  res.json({ count });
});

router.get('/users/count', async (req, res) => {
  const count = await getUserCount();
  res.json({ count });
});

router.get('/waypoints/count', async (req, res) => {
  const count = await getWaypointCount();
  res.json({ count });
});

router.get('/routes/completed-count', async (req, res) => {
  const count = await getCompletedRouteCount();
  res.json({ count });
});

router.get('/waypoints/visited-count', async (req, res) => {
  const count = await getVisitedWaypointCount();
  res.json({ count });
});

export default router;