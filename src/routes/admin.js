import { Router } from 'express';
import { authorize, injectUser } from '../auth.js';
import { pool, createRoute, updateRoute, getRoute, getRoutes, getWaypoints } from '../db.js';
import { EDIT_ROUTE, CREATE_ROUTE } from '../constants.js';

const router = Router();

/**
 * Returns null if okay otherwise an object for response
 * @param {string} routeName 
 * @param {array} waypoints 
 */
function validateRoute (route, waypoints) {
    let message = null;
    if (route.name === '') {
        message = `Route name cannot be empty!`;
    } 
    for (const waypoint of waypoints) {
        if (waypoint.name === '') {
            message = `Waypoint name cannot be empty! (Waypoint ${waypoint.orderId})`;
            break;
        }

        if (waypoint.lat === '' || waypoint.lng === '') {
            message = `Waypoint coordinates cannot be empty! (Waypoint ${waypoint.orderId})`;
            break;   
        }
    }
    if (message !== null) {
        const waypointsResponse = waypoints.map((w, _) => {
            return {
                orderId: w.orderId,
                latitude: w.lat,
                longitude: w.lng,
                name: w.name,
                id: w.id
            }
        });

        return {
            message: message,
            route: route,
            waypoints: waypointsResponse
        }
    }

    return null;
}

function getWaypointsFromRequest (req) {
    let waypoints = [];
    for (let i = 0; i < 500; i++) {
        // console.log(i);
        const waypoint = {
            id: req.body[`w${i}-id`],
            orderId: req.body[`w${i}-order-id`],
            lat: req.body[`w${i}-lat`],
            lng: req.body[`w${i}-lng`],
            name: req.body[`w${i}-name`],
        };
        if (waypoint.orderId === undefined) break;
        waypoints.push(waypoint);
    }
    return waypoints;
}

router.get('/routes/list', [authorize, injectUser], async (req, res) => {
    const userId = req.user;
    res.render('admin-list', { 
        routes: await getRoutes(userId)
    });
})
router.get('/routes/create', [authorize, injectUser], async (req, res) => {
    res.render('routes-edit', { 
        mode: CREATE_ROUTE,
        route: {},
        waypoints: [] 
    });
})
router.get('/routes/summary/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);

    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }

    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;

    // check if user is the owner of the route
    // this comparison is ugly
    if (ownerId.toString() !== userId.toString()) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }

    const waypoints = await getWaypoints(routeId);
    
    res.render('route-summary', {
        route: route,
        waypoints: waypoints
    })
})
router.get('/routes/delete/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }

    // check if user is the owner of the route
    // this comparison is ugly
    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;
    if (ownerId.toString() !== userId.toString()) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }

    res.render('route-delete', {
        route: route
    });
})
router.post('/routes/delete/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;

    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }

    // check if user is the owner of the route
    // this comparison is ugly
    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;
    if (ownerId.toString() !== userId.toString()) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }

    await pool.query(
        'DELETE FROM Waypoints WHERE route_id = ?',
        [ routeId ]
    );

    await pool.query(
        'DELETE FROM Routes WHERE id = ?',
        [ routeId ]
    );

    res.redirect('/admin/routes/list');
})

router.post('/routes/create', authorize, async (req, res) => {
    const userId = req.user;
    const routeName = req.body.name;
    const waypoints = getWaypointsFromRequest(req);

    const validation = validateRoute({ name: routeName }, waypoints);
    if (validation !== null) {
        res.render('routes-edit', {
            message: validation.message,
            mode: CREATE_ROUTE,
            route: validation.route,
            waypoints: validation.waypoints
        });
        return;
    }

    await createRoute(routeName, userId, waypoints);
    res.redirect('/admin/routes/list');
})
router.get('/routes/edit/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;
    // check if user is the owner of the route
    // this comparison is ugly
    if (ownerId.toString() !== userId.toString()) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }

    const waypoints = await getWaypoints(routeId);
    res.render('routes-edit', { 
        mode: EDIT_ROUTE, 
        route: route,
        waypoints: waypoints
    });
})
router.post('/routes/edit', authorize,  async (req, res) => {
    const routeId = req.body.route_id;
    const routeName = req.body.name;
    const userId = req.user;
    const waypoints = getWaypointsFromRequest(req);

    const route = await getRoute(routeId); 
    // check if the route exists
    if (!route) {
        console.log(`routeId=${routeId}`);
        console.log(`route=${route}`);
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }

    // check if the user is the owner of the route
    const ownerId = route.owner_id;
    if (ownerId.toString() !== userId) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    } 

    // check if route and waypoints are correct
    const validation = validateRoute(route, waypoints);
    if (validation !== null) {
        res.render('routes-edit', {
            message: validation.message,
            mode: EDIT_ROUTE,
            route: validation.route,
            waypoints: validation.waypoints
        });
        return;
    }

    await updateRoute(routeId, routeName, userId, waypoints);
    res.redirect('/admin/routes/list');
})

export default router;
