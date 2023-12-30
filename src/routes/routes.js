import { Router } from 'express';
import { authorize, injectUser } from '../auth.js';
import { pool, getRoute, getRoutes, getWaypoints } from '../db.js';

const router = Router();

router.get('/browse', injectUser, async (req, res) => {
    const userId = req.signedCookies.user;
    const routes = await getRoutes();
    const joinedRoutesQuery = await pool.query(
        'SELECT * FROM JoinedRoutes WHERE user_id = ?',
        [ userId ]
    );
    const joinedRoutes = joinedRoutesQuery[0];
    for (const route of routes) {
        if (joinedRoutes.some(r => r.route_id === route.id)) {
            route.joined = true;
        }
    }

    res.render('routes-browse', { routes: routes });
})
router.get('/join/:route_id', [authorize, injectUser], async (req, res) => {
    const userId = req.user;
    const routeId = req.params.route_id;
    // update the JoinedRoutes table
    try {
        await pool.query(
            'INSERT INTO JoinedRoutes (user_id, route_id) VALUES (?, ?)',
            [ userId, routeId ]
        );
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(500).render('error-generic', {
                message: 'You have already joined this route!'
            });
            return;
        } else {
            console.error(`routes/join/${routeId}`, err);
            res.render('error-generic', {
                message: 'An error occured. Please try again.'
            });
            return;
        }
    }
    const route = await getRoute(routeId);
    res.render('success-route-joined', { route: route });
})
router.get('/view/:route_id', injectUser, async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    const userId = req.signedCookies.user;
    let joined = false;
    if (userId) {
        const joinedQuery = await pool.query(
            'SELECT * FROM JoinedRoutes WHERE route_id = ? AND user_id = ?',
            [ routeId, userId ]
        );
        joined = joinedQuery[0].length === 1;
    }
    const waypoints = await getWaypoints(routeId);
    const userVisitsQuery = await pool.query(
        'SELECT * FROM Visits WHERE user_id = ?',
        [ userId ]
    );
    const userVisits = userVisitsQuery[0];
    for (const waypoint of waypoints) {
        if (userVisits.some(v => v.waypoint_id === waypoint.id)) {
            waypoint.visited = true;
        }
    }

    res.render('route-view', {
        route: route,
        waypoints: waypoints,
        joined: joined,
    })
})

export default router;
