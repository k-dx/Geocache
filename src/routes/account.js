import { Router } from 'express';
import { authorize, injectUser, getUser, deleteUser } from '../index.js';
import { getAchievements } from '../db.js';

const router = Router();

router.get('/', [authorize, injectUser], async (req, res) => {
    const [user, achievements] = await Promise.all([
        getUser(req.user),
        getAchievements(req.user)
    ]);
    res.render('account-info', { email: user.email, username: user.username, achievements: achievements });
})
router.get('/delete', [authorize, injectUser], async (req, res) => {
    const user = await getUser(req.user);
    res.render('account-delete', { email: user.email, username: user.username });
})
router.post('/delete', authorize, async (req, res) => {
    await deleteUser(req.user);
    res.redirect('/logout');
})

export default router;
