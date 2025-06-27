import { Router } from 'express';
import { authorize, injectUser } from '../auth.js';
import { createRoute, updateRoute, deleteRoute, getRoute, getRoutes, getWaypoints,
         getPlayers } from '../db.js';
import { EDIT_ROUTE, CREATE_ROUTE } from '../constants.js';
import fs from 'fs';

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

/** 
 * Generates a static map image with markers for the given waypoints.
 * @param {Array} markers - An array of marker objects, each with latitude, longitude, and label.
 * @param {string} [size='600x300'] - The size of the map image in the format 'widthxheight'.
 * @returns {Promise<Buffer>} - A promise that resolves to a Buffer containing the image data.
 * @throws {Error} - Throws an error
 */
const generateMapImage = async (markers, size = '600x300') => {
    const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';

    const markersParam = markers
        .map(m => `color:red|label:${m.label}|${m.lat},${m.lng}`)
        .join('&markers=');

    const params = new URLSearchParams({
        size: size,
        key: process.env.GOOGLE_MAPS_API_KEY
    });

    // Add markers as separate 'markers' params
    const paramString = params.toString() + '&markers=' + markersParam;

    const url = `${baseUrl}?${paramString}`;

    console.log('Map image URL:', url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error generating map image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const imageData = Buffer.from(arrayBuffer);
        return imageData;
    } catch (error) {
        console.error('Error generating map image:', error);
        throw error;
    }
};

/**
 * Creates a thumbnail image for a route based on its waypoints.
 * @param {Array} waypoints - An array of waypoints, each with latitude and longitude.
 * @param {string} [destinationDirectoryFs='./src/public/assets/route-thumbnails'] - The filesystem path where the thumbnail will be saved.
 * @param {string} [destinationDirectoryPublic='/assets/route-thumbnails'] - The public path for the thumbnail.
 * @param {string} [size='390x280'] - The size of the thumbnail image.
 * @returns {Promise<string>} - The public path of the created thumbnail image.
 * @throws {Error}
 * @description This function generates a static map image with markers for each waypoint,
 * saves it to the specified filesystem directory, and returns the public path for the image.
 * If the image generation fails, it returns a placeholder image path.
 */
const createRouteThumbnail = async (waypoints, destinationDirectoryFs = './src/public/assets/route-thumbnails', destinationDirectoryPublic = '/assets/route-thumbnails', size = '390x280') => {
    // Create markers for the all waypoints
    const markers = waypoints.map((wp, index) => ({
        label: index,
        ...wp
    }));
    console.log('Markers:', markers);

    // Generate the map image with the markers
    try {
        const imageData = await generateMapImage(markers, size);
        const uuid = crypto.randomUUID();
        const destinationFs = `${destinationDirectoryFs}/${uuid}.png`;
        const destinationPublic = `${destinationDirectoryPublic}/${uuid}.png`;
        fs.writeFileSync(destinationFs, imageData);
        return destinationPublic;
    } catch (error) {
        return `${destinationDirectoryPublic}/placeholder-image.jpg`;
    }
};

/**
 * Removes the thumbnail image from the filesystem if it is not the placeholder image.
 * @param {string} thumbnailPath - The path to the thumbnail image.
 */
const removeThumbnail = async (thumbnailPath) => {
    if (thumbnailPath === '/assets/route-thumbnails/placeholder-image.jpg' || thumbnailPath === null) {
        return;
    }
    const fullPath = `./src/public${thumbnailPath}`;
    try {
        fs.unlinkSync(fullPath);
        console.log(`Thumbnail removed: ${fullPath}`);
    } catch (error) {
        console.error(`Error removing thumbnail: ${error.message}`);
    }
}

router.get('/routes/list', [authorize, injectUser], async (req, res) => {
    const userId = req.user;
    res.render('admin-list', { 
        routes: await getRoutes({userId: userId})
    });
})
router.get('/routes/create', [authorize, injectUser], async (req, res) => {
    res.render('routes-edit', { 
        mode: CREATE_ROUTE,
        route: {},
        waypoints: [],
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
})
router.get('/routes/summary/:route_id', [authorize, injectUser], async (req, res) => {
    console.log('yah babhy');
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
    const players = await getPlayers(routeId);
    
    res.render('route-summary', {
        route: route,
        waypoints: waypoints,
        players: players,
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
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

    await deleteRoute(routeId);

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
            waypoints: validation.waypoints,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
        return;
    }

    const thumbnailPath = await createRouteThumbnail(waypoints);
    await createRoute(routeName, userId, waypoints, thumbnailPath);

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
        waypoints: waypoints,
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
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
            waypoints: validation.waypoints,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
        return;
    }

    const newThumbnailPath = await createRouteThumbnail(waypoints);
    const oldThumbnailPath = route.thumbnail;
    await updateRoute(routeId, routeName, userId, waypoints, newThumbnailPath);
    await removeThumbnail(oldThumbnailPath);

    res.redirect('/admin/routes/list');
})

export default router;
