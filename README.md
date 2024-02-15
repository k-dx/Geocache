# Geocache

Geocache is a real-life game about exploring places. Anyone can create a route consisting of waypoints on a map. The author of the route prints QR-Codes and places them physically at location of each respective waypoint. Others can join the route here in the app and their goal is to visit all waypoints in the route by scanning the QR-Codes at the location of each waypoint. The author of the route can see who visited which waypoints in his route.

### Running
1. `npm install`
2. Create tables from `geocache2.session.sql` in MySQL db.
3. Fill `.env.template` and put into `.env`
4. `npm start` for production or `npm run dev` for dev build

### Technologies used:
* NodeJS + ExpressJS with EJS template engine
* MySQL database via `mysql2`
* Google Maps Javascript API
* OAuth2 (Google Accounts)
* TailwindCSS with Flowbite component library
* Docker(file)

### Deployment (Google Cloud)

Services used:
* Cloud Run
* Cloud SQL
* Secrets Manager

See [deploy.md](./deploy.md) for details. I don't keep an instance up as Cloud SQL in not cheap.